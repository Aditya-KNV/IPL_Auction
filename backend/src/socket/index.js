const { Server }   = require('socket.io');
const jwt          = require('jsonwebtoken');
const User         = require('../models/User');
const AuctionSession = require('../models/AuctionSession');
const Team         = require('../models/Team');
const { registerRoomHandlers } = require('./roomHandlers');
const { getRawRoom }           = require('./roomStore');
const timer        = require('./auctionTimer');
const { isValidBid, getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer, MAX_OVERSEAS_PLAYERS } = require('../utils/teamRules');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL, methods: ['GET', 'POST'] },
  });

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('username _id');
      if (!user) return next(new Error('User not found'));

      socket.user = { userId: String(user._id), username: user.username };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[socket] ${socket.user.username} connected (${socket.id})`);

    registerRoomHandlers(io, socket);

    socket.on('join:team',      (teamId) => socket.join(`team:${teamId}`));
    socket.on('join:auctioneer', ()      => socket.join('auctioneer'));

    // ── bid:place ────────────────────────────────────────────────────────────
    //
    // Safety guarantees:
    //  1. MongoDB `findOneAndUpdate` with `currentBid: { $lt: amount }` makes
    //     the read-compare-write a single atomic operation. Two simultaneous
    //     bids for the same amount can never both succeed.
    //  2. Purse check is done BEFORE touching the session so a team can never
    //     go into negative balance.
    //  3. Bid amount must satisfy the price-tier minimum increment rule.
    //
    socket.on('bid:place', async ({ amount }) => {
      try {
        const normalizedAmount = normalizeBidAmount(amount);

        // ── 1. Sanity checks (fast, no DB) ───────────────────────────────────
        if (typeof amount !== 'number' || !Number.isFinite(amount) || normalizedAmount <= 0) {
          return socket.emit('bid:error', { message: 'Invalid bid amount' });
        }

        // ── 2. Resolve team from room assignment ──────────────────────────────
        const rawRoom  = getRawRoom(socket.id);
        const assigned = rawRoom?.teamAssignments.get(socket.user.userId);
        if (!assigned) {
          return socket.emit('bid:error', { message: 'You have not picked a team yet' });
        }
        const teamId = assigned.teamId;

        // ── 3. Verify team & purse ────────────────────────────────────────────
        const team = await Team.findById(teamId);
        if (!team) {
          return socket.emit('bid:error', { message: 'Team not found' });
        }
        if (team.remainingPurse < normalizedAmount) {
          return socket.emit('bid:error', {
            message: `Insufficient purse (₹${team.remainingPurse} Cr remaining)`,
          });
        }

        // ── 3. Validate minimum increment (pre-check) ────────────────────────
        const currentSession = await AuctionSession.findOne()
          .select('currentBid status currentPlayer currentHighestBidder')
          .populate('currentPlayer', 'nationality name');
        if (!currentSession || currentSession.status !== 'active' || !currentSession.currentPlayer) {
          return socket.emit('bid:error', { message: 'Auction is not active' });
        }
        const eligibility = await canTeamBuyPlayer(teamId, currentSession.currentPlayer);
        if (!eligibility.allowed) {
          return socket.emit('bid:error', {
            message: `Overseas player limit reached (${MAX_OVERSEAS_PLAYERS}). ${team.name} cannot buy ${currentSession.currentPlayer.name}.`,
          });
        }
        const hasExistingBid = !!currentSession.currentHighestBidder;
        const minRequired = getMinNextBid(currentSession.currentBid, hasExistingBid);
        if (normalizedAmount < minRequired) {
          return socket.emit('bid:error', { message: `Minimum bid is ₹${minRequired} Cr` });
        }

        // ── 4. Atomic conditional update ──────────────────────────────────────
        // $lt: amount ensures if a concurrent bid already raised the price,
        // this one is rejected — only one winner possible per amount level.
        const updated = await AuctionSession.findOneAndUpdate(
          hasExistingBid
            ? {
                status:        'active',
                currentPlayer: { $ne: null },
                currentBid:    { $lt: normalizedAmount },
              }
            : {
                status:              'active',
                currentPlayer:       { $ne: null },
                currentHighestBidder: null,
                currentBid:          normalizedAmount,
              },
          {
            $set:  { currentBid: normalizedAmount, currentHighestBidder: teamId },
            $push: { bids: { team: teamId, amount: normalizedAmount, timestamp: new Date() } },
          },
          { new: true }
        );

        if (!updated) {
          const fresh = await AuctionSession.findOne().select('currentBid status currentHighestBidder');
          if (!fresh || fresh.status !== 'active') {
            return socket.emit('bid:error', { message: 'Auction is not active' });
          }
          return socket.emit('bid:error', {
            message: `Bid too low — minimum is ₹${getMinNextBid(fresh.currentBid)} Cr`,
          });
        }

        // ── 4. Extend the bid timer ───────────────────────────────────────────
        timer.extend();
        AuctionSession.findOneAndUpdate(
          { status: 'active' },
          { $set: { timerEndsAt: new Date(timer.getExpiresAt()) } }
        ).catch(() => {});

        // ── 6. Broadcast to everyone ──────────────────────────────────────────
        io.emit('bid:update', {
          currentBid:    normalizedAmount,
          highestBidder: { id: teamId, name: team.name, shortName: team.shortName, color: team.color },
          minNextBid:    getMinNextBid(normalizedAmount, true),
          bidEntry:      { team: { name: team.name, shortName: team.shortName, color: team.color }, amount: normalizedAmount, timestamp: new Date() },
        });

        console.log(`[bid] ${team.name} → ₹${normalizedAmount} Cr`);
      } catch (err) {
        console.error('[bid:place] error:', err.message);
        socket.emit('bid:error', { message: 'Server error processing bid' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] ${socket.user.username} disconnected (${socket.id})`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

module.exports = { initSocket, getIO };
