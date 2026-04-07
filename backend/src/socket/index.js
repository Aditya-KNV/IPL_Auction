const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuctionSession = require('../models/AuctionSession');
const Team = require('../models/Team');
const { registerRoomHandlers } = require('./roomHandlers');
const { getRawRoom, getRawRoomByUserId } = require('./roomStore');
const acceleratedStore = require('./acceleratedStore');
const timer = require('./auctionTimer');
const { getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer, MAX_OVERSEAS_SQUAD, MAX_OVERSEAS_PLAYING } = require('../utils/teamRules');

let io;

/** Returns the socket's current room code, or null if not in a room. */
const getRoomCode = (socket) => {
  const rawRoom = getRawRoom(socket.id) ?? getRawRoomByUserId(socket.user.userId);
  return rawRoom?.code ?? null;
};

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

    // ── bid:place ────────────────────────────────────────────────────────────
    socket.on('bid:place', async ({ amount }) => {
      try {
        const roomCode = getRoomCode(socket);
        if (!roomCode) return socket.emit('bid:error', { message: 'You are not in a room' });

        const normalizedAmount = normalizeBidAmount(amount);
        const now = Date.now();

        if (typeof amount !== 'number' || !Number.isFinite(amount) || normalizedAmount <= 0) {
          return socket.emit('bid:error', { message: 'Invalid bid amount' });
        }

        let graceHeld = false;
        if (!timer.isRunning(roomCode)) {
          const expiresAt = timer.getExpiresAt(roomCode);
          if (!expiresAt || now > expiresAt + timer.EXPIRE_GRACE_MS) {
            return socket.emit('bid:error', { message: 'Bidding window just closed' });
          }
          if (!timer.holdGrace(roomCode, now)) {
            return socket.emit('bid:error', { message: 'Bidding window just closed' });
          }
          graceHeld = true;
        }

        const reject = async (message) => {
          if (graceHeld) await timer.releaseGrace(roomCode);
          socket.emit('bid:error', { message });
        };

        const assigned = getAssignedTeamForSocket(socket);
        if (!assigned) return reject('You have not picked a team yet');

        const teamId = assigned.teamId;
        const team = await Team.findById(teamId);
        if (!team) return reject('Team not found');

        if (team.remainingPurse < normalizedAmount) {
          return reject(`Insufficient purse (Rs ${team.remainingPurse} Cr remaining)`);
        }

        const currentSession = await AuctionSession.findOne({ roomCode })
          .select('currentBid currentPlayer currentHighestBidder status')
          .populate('currentPlayer', 'nationality name');

        if (!currentSession || !currentSession.currentPlayer) {
          return reject('Auction is not active');
        }
        if (currentSession.status !== 'active') {
          return reject(currentSession.status === 'paused' ? 'Auction is paused' : 'Auction is not active');
        }

        const eligibility = await canTeamBuyPlayer(teamId, currentSession.currentPlayer);
        if (!eligibility.allowed) {
          const message = eligibility.reason === 'playing12'
            ? `Playing-12 overseas limit reached (${MAX_OVERSEAS_PLAYING}). Buy more Indian players to unlock the bench slots.`
            : `Overseas squad limit reached (${MAX_OVERSEAS_SQUAD}). ${team.name} cannot buy more overseas players.`;
          return reject(message);
        }

        const hasExistingBid = !!currentSession.currentHighestBidder;
        const minRequired = getMinNextBid(currentSession.currentBid, hasExistingBid);
        if (normalizedAmount < minRequired) {
          return reject(`Minimum bid is Rs ${minRequired} Cr`);
        }

        const updated = await AuctionSession.findOneAndUpdate(
          hasExistingBid
            ? { roomCode, status: 'active', currentPlayer: currentSession.currentPlayer._id, currentBid: { $lt: normalizedAmount } }
            : { roomCode, status: 'active', currentPlayer: currentSession.currentPlayer._id, currentHighestBidder: null },
          {
            $set: { currentBid: normalizedAmount, currentHighestBidder: teamId, withdrawnTeams: [] },
            $push: { bids: { team: teamId, amount: normalizedAmount, timestamp: new Date() } },
          },
          { new: true }
        );

        if (!updated) {
          const fresh = await AuctionSession.findOne({ roomCode }).select('currentBid status');
          if (!fresh || fresh.status !== 'active') {
            return reject(fresh?.status === 'paused' ? 'Auction is paused' : 'Auction is not active');
          }
          return reject(`Bid too low - minimum is Rs ${getMinNextBid(fresh.currentBid)} Cr`);
        }

        timer.extend(roomCode, now);
        graceHeld = false;
        const timerEndsAt = timer.getExpiresAt(roomCode) ? new Date(timer.getExpiresAt(roomCode)) : null;
        if (timerEndsAt) {
          updated.timerEndsAt = timerEndsAt;
          await updated.save();
        }

        const { emitWithdrawState } = require('../controllers/auctionController');
        await emitWithdrawState(io, roomCode, updated, { reason: 'reset' });

        io.to(roomCode).emit('bid:update', {
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

        console.log(`[bid] ${team.name} -> Rs ${normalizedAmount} Cr (room ${roomCode})`);
      } catch (err) {
        console.error('[bid:place] error:', err.message);
        socket.emit('bid:error', { message: 'Server error processing bid' });
      }
    });

    // ── auction:withdraw ─────────────────────────────────────────────────────
    socket.on('auction:withdraw', async () => {
      try {
        const roomCode = getRoomCode(socket);
        if (!roomCode) return socket.emit('bid:error', { message: 'You are not in a room' });

        const assigned = getAssignedTeamForSocket(socket);
        if (!assigned?.teamId) {
          return socket.emit('bid:error', { message: 'Pick a team before you withdraw' });
        }

        const { applyWithdraw } = require('../controllers/auctionController');
        const result = await applyWithdraw(assigned.teamId, roomCode);
        if (result?.error) {
          return socket.emit('bid:error', { message: result.error });
        }
      } catch (err) {
        console.error('[auction:withdraw] error:', err.message);
        socket.emit('bid:error', { message: 'Server error processing withdraw' });
      }
    });

    // ── settings:update-timer ────────────────────────────────────────────────
    socket.on('settings:update-timer', async ({ duration }) => {
      try {
        const rawRoom = getRawRoom(socket.id);
        if (!rawRoom || rawRoom.hostId !== socket.id) {
          return socket.emit('room:error', { message: 'Only the host can change settings' });
        }

        const d = Number(duration);
        if (!Number.isFinite(d) || d < 5 || d > 120) {
          return socket.emit('room:error', { message: 'Timer must be between 5 and 120 seconds' });
        }

        const roomCode = rawRoom.code;
        await AuctionSession.findOneAndUpdate({ roomCode }, { $set: { timerDuration: d } });
        io.to(roomCode).emit('settings:timer-updated', { timerDuration: d });
        console.log(`[settings] ${socket.user.username} set timer to ${d}s (room ${roomCode})`);
      } catch (err) {
        console.error('[settings:update-timer] error:', err.message);
        socket.emit('room:error', { message: 'Failed to update timer' });
      }
    });

    // ── accelerated:init ─────────────────────────────────────────────────────
    socket.on('accelerated:init', async ({ maxPicks } = {}) => {
      try {
        const rawRoom = getRawRoom(socket.id);
        if (!rawRoom || rawRoom.hostId !== socket.id) {
          return socket.emit('room:error', { message: 'Only the host can start accelerated mode' });
        }

        const roomCode = rawRoom.code;
        const max = Number.isFinite(Number(maxPicks)) && Number(maxPicks) >= 0
          ? Math.floor(Number(maxPicks))
          : 7;

        const { openAcceleratedSelection } = require('../controllers/auctionController');
        const result = await openAcceleratedSelection(roomCode, max);
        if (result.error) return socket.emit('room:error', { message: result.error });

        io.to(roomCode).emit('accelerated:open', {
          players:          result.players,
          maxPicks:         max,
          expectedTeamIds:  result.assignedTeamIds,
          submittedTeamIds: [],
          allSubmitted:     result.assignedTeamIds.length === 0,
        });

        console.log(`[accelerated] ${socket.user.username} opened selection in room ${roomCode} (${result.players.length} players)`);
      } catch (err) {
        console.error('[accelerated:init]', err.message);
        socket.emit('room:error', { message: 'Failed to open accelerated mode' });
      }
    });

    // ── accelerated:submit ───────────────────────────────────────────────────
    socket.on('accelerated:submit', async ({ picks }) => {
      try {
        const roomCode = getRoomCode(socket);
        if (!roomCode) return socket.emit('room:error', { message: 'You are not in a room' });

        const assigned = getAssignedTeamForSocket(socket);
        if (!assigned?.teamId) {
          return socket.emit('room:error', { message: 'You must pick a team before submitting' });
        }
        if (!Array.isArray(picks)) {
          return socket.emit('room:error', { message: 'Invalid picks format' });
        }

        const result = acceleratedStore.submitPicks(roomCode, assigned.teamId, picks);
        if (result.error) return socket.emit('room:error', { message: result.error });

        const snapshot = acceleratedStore.getSelectionSnapshot(roomCode);
        if (!snapshot) return;

        io.to(roomCode).emit('accelerated:progress', {
          submittedTeamIds: snapshot.submittedTeamIds,
          expectedTeamIds:  snapshot.expectedTeamIds,
          allSubmitted:     snapshot.allSubmitted,
          maxPicks:         snapshot.maxPicks,
        });

        console.log(`[accelerated] ${socket.user.username} submitted ${picks.length} picks in room ${roomCode}`);
      } catch (err) {
        console.error('[accelerated:submit]', err.message);
        socket.emit('room:error', { message: 'Failed to submit picks' });
      }
    });

    // ── accelerated:begin ────────────────────────────────────────────────────
    socket.on('accelerated:begin', async () => {
      try {
        const rawRoom = getRawRoom(socket.id);
        if (!rawRoom || rawRoom.hostId !== socket.id) {
          return socket.emit('room:error', { message: 'Only the host can begin the accelerated auction' });
        }

        const roomCode = rawRoom.code;
        const { beginAcceleratedAuction } = require('../controllers/auctionController');
        const result = await beginAcceleratedAuction(roomCode);
        if (result.error) return socket.emit('room:error', { message: result.error });

        io.to(roomCode).emit('accelerated:started', { playerCount: result.playerCount });
        console.log(`[accelerated] started in room ${roomCode} — ${result.playerCount} players in pool`);
      } catch (err) {
        console.error('[accelerated:begin]', err.message);
        socket.emit('room:error', { message: 'Failed to begin accelerated auction' });
      }
    });

    // ── accelerated:cancel ───────────────────────────────────────────────────
    socket.on('accelerated:cancel', async () => {
      try {
        const rawRoom = getRawRoom(socket.id);
        if (!rawRoom || rawRoom.hostId !== socket.id) {
          return socket.emit('room:error', { message: 'Only the host can cancel accelerated mode' });
        }

        const roomCode = rawRoom.code;
        const { cancelAcceleratedMode } = require('../controllers/auctionController');
        cancelAcceleratedMode(roomCode);
        io.to(roomCode).emit('accelerated:closed');
        console.log(`[accelerated] ${socket.user.username} cancelled accelerated mode in room ${roomCode}`);
      } catch (err) {
        console.error('[accelerated:cancel]', err.message);
        socket.emit('room:error', { message: 'Failed to cancel accelerated mode' });
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
