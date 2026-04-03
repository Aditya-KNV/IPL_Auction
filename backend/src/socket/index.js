const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuctionSession = require('../models/AuctionSession');
const Team = require('../models/Team');
const { registerRoomHandlers } = require('./roomHandlers');
const { getRawRoom, getRawRoomByUserId } = require('./roomStore');
const timer = require('./auctionTimer');
const { getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer, MAX_OVERSEAS_SQUAD, MAX_OVERSEAS_PLAYING } = require('../utils/teamRules');

let io;

const getAssignedTeamForSocket = (socket) => {
  const rawRoom = getRawRoom(socket.id) ?? getRawRoomByUserId(socket.user.userId);
  return rawRoom?.teamAssignments.get(socket.user.userId) ?? null;
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || true, methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('username _id');
      if (!user) return next(new Error('User not found'));

      socket.user = { userId: String(user._id), username: user.username };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] ${socket.user.username} connected (${socket.id})`);

    registerRoomHandlers(io, socket);

    socket.on('join:team', (teamId) => socket.join(`team:${teamId}`));
    socket.on('join:auctioneer', () => socket.join('auctioneer'));

    socket.on('bid:place', async ({ amount }) => {
      try {
        const normalizedAmount = normalizeBidAmount(amount);
        const now = Date.now();

        if (typeof amount !== 'number' || !Number.isFinite(amount) || normalizedAmount <= 0) {
          return socket.emit('bid:error', { message: 'Invalid bid amount' });
        }

        const assigned = getAssignedTeamForSocket(socket);
        if (!assigned) {
          return socket.emit('bid:error', { message: 'You have not picked a team yet' });
        }

        const teamId = assigned.teamId;
        const team = await Team.findById(teamId);
        if (!team) {
          return socket.emit('bid:error', { message: 'Team not found' });
        }

        if (team.remainingPurse < normalizedAmount) {
          return socket.emit('bid:error', {
            message: `Insufficient purse (Rs ${team.remainingPurse} Cr remaining)`,
          });
        }

        const currentSession = await AuctionSession.findOne()
          .select('currentBid currentPlayer currentHighestBidder status')
          .populate('currentPlayer', 'nationality name');

        if (!currentSession || !currentSession.currentPlayer) {
          return socket.emit('bid:error', { message: 'Auction is not active' });
        }
        if (currentSession.status !== 'active') {
          return socket.emit('bid:error', {
            message: currentSession.status === 'paused' ? 'Auction is paused' : 'Auction is not active',
          });
        }

        if (!timer.isRunning() && timer.getExpiresAt() && now > timer.getExpiresAt() + timer.EXPIRE_GRACE_MS) {
          return socket.emit('bid:error', { message: 'Bidding window just closed' });
        }

        const eligibility = await canTeamBuyPlayer(teamId, currentSession.currentPlayer);
        if (!eligibility.allowed) {
          const message = eligibility.reason === 'playing12'
            ? `Playing-12 overseas limit reached (${MAX_OVERSEAS_PLAYING}). Buy more Indian players to unlock the bench slots.`
            : `Overseas squad limit reached (${MAX_OVERSEAS_SQUAD}). ${team.name} cannot buy more overseas players.`;
          return socket.emit('bid:error', { message });
        }

        const hasExistingBid = !!currentSession.currentHighestBidder;
        const minRequired = getMinNextBid(currentSession.currentBid, hasExistingBid);
        if (normalizedAmount < minRequired) {
          return socket.emit('bid:error', { message: `Minimum bid is Rs ${minRequired} Cr` });
        }

        const updated = await AuctionSession.findOneAndUpdate(
          hasExistingBid
            ? {
                status: 'active',
                currentPlayer: currentSession.currentPlayer._id,
                currentBid: { $lt: normalizedAmount },
              }
            : {
                status: 'active',
                currentPlayer: currentSession.currentPlayer._id,
                currentHighestBidder: null,
                currentBid: normalizedAmount,
              },
          {
            $set: {
              currentBid: normalizedAmount,
              currentHighestBidder: teamId,
              withdrawnTeams: [],
            },
            $push: { bids: { team: teamId, amount: normalizedAmount, timestamp: new Date() } },
          },
          { new: true }
        );

        if (!updated) {
          const fresh = await AuctionSession.findOne().select('currentBid status');
          if (!fresh || fresh.status !== 'active') {
            return socket.emit('bid:error', {
              message: fresh?.status === 'paused' ? 'Auction is paused' : 'Auction is not active',
            });
          }
          return socket.emit('bid:error', {
            message: `Bid too low - minimum is Rs ${getMinNextBid(fresh.currentBid)} Cr`,
          });
        }

        timer.extend();
        const timerEndsAt = timer.getExpiresAt() ? new Date(timer.getExpiresAt()) : null;
        if (timerEndsAt) {
          updated.timerEndsAt = timerEndsAt;
          await updated.save();
        }

        const { emitWithdrawState } = require('../controllers/auctionController');
        await emitWithdrawState(io, updated, { reason: 'reset' });

        io.emit('bid:update', {
          currentBid: normalizedAmount,
          highestBidder: { id: teamId, name: team.name, shortName: team.shortName, color: team.color },
          minNextBid: getMinNextBid(normalizedAmount, true),
          timerEndsAt,
          bidEntry: {
            team: { name: team.name, shortName: team.shortName, color: team.color },
            amount: normalizedAmount,
            timestamp: new Date(),
          },
        });

        console.log(`[bid] ${team.name} -> Rs ${normalizedAmount} Cr`);
      } catch (err) {
        console.error('[bid:place] error:', err.message);
        socket.emit('bid:error', { message: 'Server error processing bid' });
      }
    });

    socket.on('auction:withdraw', async () => {
      try {
        const assigned = getAssignedTeamForSocket(socket);
        if (!assigned?.teamId) {
          return socket.emit('bid:error', { message: 'Pick a team before you withdraw' });
        }

        const { applyWithdraw } = require('../controllers/auctionController');
        const result = await applyWithdraw(assigned.teamId);
        if (result?.error) {
          return socket.emit('bid:error', { message: result.error });
        }
      } catch (err) {
        console.error('[auction:withdraw] error:', err.message);
        socket.emit('bid:error', { message: 'Server error processing withdraw' });
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
