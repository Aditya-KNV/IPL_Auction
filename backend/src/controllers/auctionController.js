const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { getIO } = require('../socket');
const timer = require('../socket/auctionTimer');
const { getAssignedTeamIds } = require('../socket/roomStore');
const acceleratedStore = require('../socket/acceleratedStore');
const { getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer } = require('../utils/teamRules');

const NEXT_PLAYER_DELAY_MS = 200;

// ── Concurrency guards ────────────────────────────────────────────────────────
// Node.js is single-threaded, so a plain Set acquired synchronously is atomic.
// These prevent two async paths (timer expire + applyWithdraw) from both trying
// to finish the same player or bring the next player at the same time.
const _finishing    = new Set(); // rooms currently executing finishCurrentPlayer
const _bringingNext = new Set(); // rooms currently executing bringNextPlayer

const pickRandomPlayer = async (roomCode) => {
  // ── Accelerated mode: only pick from the curated pool ─────────────────────
  const pool = acceleratedStore.getPool(roomCode);
  if (pool !== null) {
    const poolIds = [...pool];
    if (poolIds.length === 0) return null; // pool exhausted → auction completes

    // Pick a random available player from the pool (Mongoose casts strings to ObjectId)
    const available = await Player.find({ _id: { $in: poolIds }, status: 'available' }).lean();
    if (!available.length) return null;
    const pick = available[Math.floor(Math.random() * available.length)];
    return Player.findById(pick._id);
  }

  // ── Normal mode ────────────────────────────────────────────────────────────
  // Only look at 'available' players — unsold players are NOT re-queued.
  const [nextSet] = await Player.aggregate([
    { $match: { status: 'available' } },
    {
      $group: {
        _id: null,
        minSetOrder: { $min: '$auctionSetOrder' },
      },
    },
  ]);

  if (nextSet?.minSetOrder == null) {
    // No sets left — try any remaining available player
    const fallbackResults = await Player.aggregate([
      { $match: { status: 'available' } },
      { $sample: { size: 1 } },
    ]);
    return fallbackResults[0] ? await Player.findById(fallbackResults[0]._id) : null;
  }

  const results = await Player.aggregate([
    {
      $match: {
        status: 'available',          // strictly available only — no re-queueing unsold
        auctionSetOrder: nextSet.minSetOrder,
      },
    },
    { $sample: { size: 1 } },
  ]);

  return results[0] ? await Player.findById(results[0]._id) : null;
};

const serializeWithdrawnTeams = async (withdrawnTeams) => {
  if (!withdrawnTeams?.length) return [];

  const teams = await Team.find({ _id: { $in: withdrawnTeams } }).select('name shortName color');
  return teams.map((team) => team.toObject());
};

const emitWithdrawState = async (io, roomCode, session, extra = {}) => {
  io.to(roomCode).emit('auction:withdraw-updated', {
    withdrawnTeams: await serializeWithdrawnTeams(session.withdrawnTeams),
    highestBidder: session.currentHighestBidder ? String(session.currentHighestBidder) : null,
    ...extra,
  });
};

const getWithdrawalState = (session, roomCode) => {
  const assignedTeamIds = getAssignedTeamIds(roomCode);
  const withdrawnIds = new Set((session.withdrawnTeams || []).map((teamId) => String(teamId)));
  const highestBidderId = session.currentHighestBidder ? String(session.currentHighestBidder) : null;
  const everyoneWithdrawn =
    assignedTeamIds.length > 0 && assignedTeamIds.every((teamId) => withdrawnIds.has(teamId));
  const allNonLeadingWithdrawn =
    !!highestBidderId &&
    assignedTeamIds
      .filter((teamId) => teamId !== highestBidderId)
      .every((teamId) => withdrawnIds.has(teamId));

  return { assignedTeamIds, highestBidderId, everyoneWithdrawn, allNonLeadingWithdrawn };
};

const bringNextPlayer = async (session, io, roomCode) => {
  // Guard: only one bringNextPlayer at a time per room.
  // Acquired synchronously so it's atomic in Node.js's single-threaded model.
  if (_bringingNext.has(roomCode)) {
    console.log(`[auction] bringNextPlayer skipped — already in progress (room ${roomCode})`);
    return;
  }
  _bringingNext.add(roomCode);

  try {
    const player = await pickRandomPlayer(roomCode);

    if (!player) {
      timer.stop(roomCode);
      acceleratedStore.reset(roomCode); // clear pool/selection so a fresh start isn't constrained
      session.status = 'completed';
      session.currentPlayer = null;
      session.withdrawnTeams = [];
      await session.save();
      io.to(roomCode).emit('auction:completed');
      return;
    }

    timer.stop(roomCode);

    player.status = 'in-auction';
    await player.save();

    const endsAt = new Date(Date.now() + session.timerDuration * 1000);
    session.currentPlayer = player._id;
    session.currentBid = normalizeBidAmount(player.basePrice);
    session.currentHighestBidder = null;
    session.bids = [];
    session.withdrawnTeams = [];
    session.timerEndsAt = endsAt;
    await session.save();

    io.to(roomCode).emit('auction:nextPlayer', {
      player: player.toObject(),
      currentBid: session.currentBid,
      timerDuration: session.timerDuration,
      timerEndsAt: endsAt,
      serverNow: Date.now(),
      minNextBid: getMinNextBid(session.currentBid, false),
      withdrawnTeams: [],
    });

    timer.start(roomCode, io, session.timerDuration, makeExpireCallback(roomCode));
  } finally {
    _bringingNext.delete(roomCode);
  }
};

const executeSale = async (session) => {
  const playerIdToFinish  = session.currentPlayer;
  const teamIdToBuy       = session.currentHighestBidder;

  if (!playerIdToFinish) throw new Error('No current player');
  if (!teamIdToBuy)      throw new Error('No team has placed a bid');

  // Atomically claim this player — only succeeds if currentPlayer still matches.
  // Prevents overwriting a newer session state (e.g. bringNextPlayer already ran).
  const updatedSession = await AuctionSession.findOneAndUpdate(
    { _id: session._id, currentPlayer: playerIdToFinish },
    {
      $set: {
        currentPlayer:        null,
        currentBid:           0,
        currentHighestBidder: null,
        bids:                 [],
        withdrawnTeams:       [],
        timerEndsAt:          null,
      },
      $push: { soldPlayers: playerIdToFinish },
    },
    { new: true }
  );

  if (!updatedSession) {
    console.log('[auction] executeSale: player already processed, skipping');
    throw new Error('Player already processed by another path');
  }

  const [player, team] = await Promise.all([
    Player.findById(playerIdToFinish),
    Team.findById(teamIdToBuy).lean(),
  ]);

  if (!player) throw new Error('Player not found');
  if (!team)   throw new Error('Team not found');

  const finalBid = normalizeBidAmount(session.currentBid);

  const eligibility = await canTeamBuyPlayer(team._id, player, team);
  if (!eligibility.allowed) {
    throw new Error(`Overseas squad limit reached (max ${eligibility.cap ?? 8} overseas per squad)`);
  }

  // Atomic conditional deduction — the purse check and the write happen in a
  // single query, closing the read-then-save gap that let two concurrent
  // sales for the same team both pass a stale purse check and double-spend.
  const updatedTeam = await Team.findOneAndUpdate(
    { _id: teamIdToBuy, remainingPurse: { $gte: finalBid } },
    { $inc: { remainingPurse: -finalBid }, $push: { players: player._id } },
    { new: true }
  );
  if (!updatedTeam) throw new Error('Insufficient purse');

  player.status    = 'sold';
  player.team      = team._id;
  player.soldPrice = finalBid;
  await player.save();

  return { player: player.toObject(), team: updatedTeam.toObject() };
};

const executeUnsold = async (session) => {
  const playerIdToFinish = session.currentPlayer;
  if (!playerIdToFinish) return null;

  // Atomically claim this player — only succeeds if currentPlayer still matches.
  // Prevents overwriting a newer session state (e.g. bringNextPlayer already ran).
  const updatedSession = await AuctionSession.findOneAndUpdate(
    { _id: session._id, currentPlayer: playerIdToFinish },
    {
      $set: {
        currentPlayer:        null,
        currentBid:           0,
        currentHighestBidder: null,
        bids:                 [],
        withdrawnTeams:       [],
        timerEndsAt:          null,
      },
      $push: { unsoldPlayers: playerIdToFinish },
    },
    { new: true }
  );

  if (!updatedSession) {
    // Another concurrent path already cleared this player — do nothing.
    console.log('[auction] executeUnsold: player already processed, skipping');
    return false; // sentinel: atomic claim failed
  }

  const player = await Player.findById(playerIdToFinish);
  if (player && player.status === 'in-auction') {
    player.status = 'unsold';
    await player.save();
  }

  return player ? player.toObject() : null;
};

const finishCurrentPlayer = async ({ io, session, roomCode, mode, auto = false, reason = null }) => {
  // Guard: only one finishCurrentPlayer at a time per room.
  // Without this, the timer-expire callback and applyWithdraw can interleave at
  // await points and both attempt to finish the same player — causing double
  // unsold/sold marks and duplicate bringNextPlayer calls that corrupt auction state.
  if (_finishing.has(roomCode)) {
    console.log(`[auction] finishCurrentPlayer skipped — already finishing (room ${roomCode})`);
    return;
  }
  _finishing.add(roomCode);

  let processed = false;
  try {
    timer.stop(roomCode);

    if (mode === 'sold') {
      let result;
      try {
        result = await executeSale(session);
      } catch (err) {
        if (err.message === 'Player already processed by another path') return;
        throw err;
      }
      processed = true;
      io.to(roomCode).emit('auction:sold', { player: result.player, team: result.team, amount: result.player.soldPrice, auto, reason });
    } else {
      const result = await executeUnsold(session);
      if (result === false) return; // atomic claim failed — another path already processed this player
      processed = true;
      io.to(roomCode).emit('auction:unsold', { player: result, auto, reason });
    }

    await emitWithdrawState(io, roomCode, session, { reason: 'reset' });
  } finally {
    _finishing.delete(roomCode);
  }

  if (!processed) return;

  setTimeout(async () => {
    try {
      const fresh = await AuctionSession.findOne({ roomCode });
      // Double-guard: skip if another bringNextPlayer already set a new currentPlayer
      if (fresh && fresh.status === 'active' && !fresh.currentPlayer) {
        await bringNextPlayer(fresh, io, roomCode);
      }
    } catch (err) {
      console.error('[auction] bringNextPlayer error:', err.message);
    }
  }, NEXT_PLAYER_DELAY_MS);
};

const applyWithdraw = async (teamId, roomCode) => {
  const session = await AuctionSession.findOne({ roomCode });
  if (!session || !session.currentPlayer) {
    return { error: 'Auction is not active' };
  }
  if (session.status !== 'active') {
    return { error: session.status === 'paused' ? 'Auction is paused' : 'Auction is not active' };
  }

  const assignedTeamIds = getAssignedTeamIds(roomCode);
  const normalizedTeamId = String(teamId);
  if (!assignedTeamIds.includes(normalizedTeamId)) {
    return { error: 'You are not assigned to a team in this room' };
  }

  if (session.currentHighestBidder && String(session.currentHighestBidder) === normalizedTeamId) {
    return { error: 'The current highest bidder cannot withdraw' };
  }

  // Atomic add — $addToSet prevents duplicates and is race-condition-safe
  const updated = await AuctionSession.findOneAndUpdate(
    { roomCode, _id: session._id, status: 'active', currentPlayer: { $ne: null } },
    { $addToSet: { withdrawnTeams: teamId } },
    { new: true }
  );
  if (!updated) return { error: 'Auction state changed' };

  const io = getIO();
  const withdrawalState = getWithdrawalState(updated, roomCode);
  await emitWithdrawState(io, roomCode, updated);

  if (withdrawalState.everyoneWithdrawn) {
    await finishCurrentPlayer({ io, session: updated, roomCode, mode: 'unsold', reason: 'all-withdrew' });
    return { session: updated, resolved: 'unsold' };
  }

  if (withdrawalState.allNonLeadingWithdrawn) {
    await finishCurrentPlayer({ io, session: updated, roomCode, mode: 'sold', reason: 'others-withdrew' });
    return { session: updated, resolved: 'sold' };
  }

  return { session: updated, resolved: null };
};

const makeExpireCallback = (roomCode) => async () => {
  const io = getIO();
  let session;

  try {
    // Always fetch fresh — never rely on a captured session object which may be stale.
    session = await AuctionSession.findOne({ roomCode });
    if (!session || !session.currentPlayer) return;
    if (session.status !== 'active') return;

    await finishCurrentPlayer({
      io,
      session,
      roomCode,
      mode: session.currentHighestBidder ? 'sold' : 'unsold',
      auto: true,
      reason: 'timer-expired',
    });
  } catch (err) {
    console.error('[auction] timer expire error:', err.message);
    try {
      // Recovery: return the stuck player to available so it re-enters the queue
      if (session?.currentPlayer) {
        await AuctionSession.findOneAndUpdate(
          { _id: session._id, currentPlayer: session.currentPlayer },
          { $set: { currentPlayer: null, currentBid: 0, currentHighestBidder: null,
                    bids: [], withdrawnTeams: [], timerEndsAt: null } }
        );
        await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
      }
    } catch (recErr) {
      console.error('[auction] recovery error:', recErr.message);
    }
  }
};

const getSession = async (req, res) => {
  try {
    const roomCode = req.query.roomCode;
    if (!roomCode) return res.json(null);

    const session = await AuctionSession.findOne({ roomCode })
      .populate('currentPlayer')
      .populate('currentHighestBidder', 'name shortName color')
      .populate('soldPlayers', 'name role soldPrice')
      .populate('unsoldPlayers', 'name role');

    if (!session) {
      return res.json(null);
    }

    const plain = session.toObject();
    plain.timeLeft = timer.getTimeLeft(roomCode);
    plain.serverNow = Date.now();
    plain.minNextBid = session.currentBid
      ? getMinNextBid(session.currentBid, !!session.currentHighestBidder)
      : 0;
    plain.withdrawnTeams = await serializeWithdrawnTeams(session.withdrawnTeams);
    return res.json(plain);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const startAuction = async (req, res) => {
  try {
    const roomCode = req.body.roomCode;
    if (!roomCode) return res.status(400).json({ message: 'roomCode required' });

    let session = await AuctionSession.findOne({ roomCode });
    if (!session) session = new AuctionSession({ roomCode });

    if (session.status === 'active') {
      return res.status(400).json({ message: 'Auction already running' });
    }

    // Reset both 'in-auction' (crashed/stuck) and 'unsold' (from previous auction run)
    // so every player re-enters the fresh auction. 'sold' players are intentionally kept.
    await Player.updateMany(
      { status: { $in: ['in-auction', 'unsold'] } },
      { $set: { status: 'available' } }
    );

    // Clear any stale per-room locks in case the previous auction crashed mid-operation
    _finishing.delete(roomCode);
    _bringingNext.delete(roomCode);

    session.status = 'active';
    session.currentPlayer = null;
    session.currentBid = 0;
    session.currentHighestBidder = null;
    session.bids = [];
    session.soldPlayers = [];
    session.unsoldPlayers = [];
    session.withdrawnTeams = [];
    session.timerEndsAt = null;
    await session.save();

    const io = getIO();
    io.to(roomCode).emit('auction:status', { status: 'active' });
    await bringNextPlayer(session, io, roomCode);

    res.json({ message: 'Auction started' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const pauseAuction = async (req, res) => {
  try {
    const roomCode = req.body.roomCode;
    if (!roomCode) return res.status(400).json({ message: 'roomCode required' });

    const session = await AuctionSession.findOne({ roomCode });
    if (!session || session.status !== 'active') {
      return res.status(400).json({ message: 'Auction is not active' });
    }

    timer.stop(roomCode);
    session.status = 'paused';
    session.timerEndsAt = null;
    await session.save();

    getIO().to(roomCode).emit('auction:status', { status: 'paused' });
    res.json({ status: 'paused' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const resumeAuction = async (req, res) => {
  try {
    const roomCode = req.body.roomCode;
    if (!roomCode) return res.status(400).json({ message: 'roomCode required' });

    const session = await AuctionSession.findOne({ roomCode });
    if (!session || session.status !== 'paused') {
      return res.status(400).json({ message: 'Auction is not paused' });
    }

    session.status = 'active';
    const io = getIO();

    if (session.currentPlayer) {
      const endsAt = new Date(Date.now() + session.timerDuration * 1000);
      session.timerEndsAt = endsAt;
      await session.save();
      await session.populate('currentHighestBidder', 'name shortName color');

      timer.start(roomCode, io, session.timerDuration, makeExpireCallback(roomCode));
      io.to(roomCode).emit('auction:resumed', {
        timerDuration: session.timerDuration,
        timerEndsAt: endsAt,
        serverNow: Date.now(),
        currentBid: session.currentBid,
        minNextBid: getMinNextBid(session.currentBid, !!session.currentHighestBidder),
        highestBidder: session.currentHighestBidder || null,
      });
      await emitWithdrawState(io, roomCode, session);
    } else {
      await session.save();
      await bringNextPlayer(session, io, roomCode);
    }

    io.to(roomCode).emit('auction:status', { status: 'active' });
    res.json({ status: 'active' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const endAuction = async (req, res) => {
  try {
    const roomCode = req.body.roomCode;
    if (!roomCode) return res.status(400).json({ message: 'roomCode required' });

    const session = await AuctionSession.findOne({ roomCode });
    if (!session || session.status === 'completed') {
      return res.status(400).json({ message: 'Auction is already completed or not started' });
    }

    timer.stop(roomCode);

    if (session.currentPlayer) {
      await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
    }

    session.status = 'completed';
    session.currentPlayer = null;
    session.currentBid = 0;
    session.currentHighestBidder = null;
    session.bids = [];
    session.withdrawnTeams = [];
    session.timerEndsAt = null;
    await session.save();

    acceleratedStore.reset(roomCode);
    _finishing.delete(roomCode);
    _bringingNext.delete(roomCode);

    const io = getIO();
    await emitWithdrawState(io, roomCode, session, { reason: 'reset' });
    io.to(roomCode).emit('auction:completed');
    res.json({ status: 'completed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── Accelerated auction ─────────────────────────────────────────────────── */

/**
 * Pause the auction (if active) and open the player-selection phase.
 * Returns { players, assignedTeamIds } or { error }.
 */
const openAcceleratedSelection = async (roomCode, maxPicks) => {
  const session = await AuctionSession.findOne({ roomCode });
  if (!session) return { error: 'No auction session found' };

  if (session.status !== 'active' && session.status !== 'paused') {
    return { error: 'Auction must be active or paused to use accelerated mode' };
  }

  if (session.status === 'active') {
    timer.stop(roomCode);
    session.status = 'paused';
    session.timerEndsAt = null;
    await session.save();
    getIO().to(roomCode).emit('auction:status', { status: 'paused' });
  }

  // Only show unsold players that belong to THIS session, not globally
  const sessionUnsoldIds = (session.unsoldPlayers || []).map((id) => String(id));
  const players = await Player.find({
    $or: [
      { status: 'available' },
      ...(sessionUnsoldIds.length
        ? [{ _id: { $in: sessionUnsoldIds }, status: 'unsold' }]
        : []),
    ],
  })
    .select('_id name role nationality basePrice status')
    .lean();

  const assignedTeamIds = getAssignedTeamIds(roomCode);
  acceleratedStore.initSelection(roomCode, players, assignedTeamIds, maxPicks);

  return { players, assignedTeamIds, maxPicks };
};

const beginAcceleratedAuction = async (roomCode) => {
  const session = await AuctionSession.findOne({ roomCode });
  if (!session) return { error: 'No auction session found' };

  const pool    = acceleratedStore.buildPool(roomCode);
  const poolIds = [...pool];

  if (poolIds.length === 0) return { error: 'No players were selected — add picks first' };

  await Player.updateMany({ _id: { $in: poolIds }, status: 'unsold' }, { $set: { status: 'available' } });

  if (session.currentPlayer) {
    await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
  }

  acceleratedStore.setPool(roomCode, pool);
  acceleratedStore.clearSelection(roomCode);

  session.status = 'active';
  session.currentPlayer = null;
  session.currentBid = 0;
  session.currentHighestBidder = null;
  session.bids = [];
  session.withdrawnTeams = [];
  session.timerEndsAt = null;
  await session.save();

  const io = getIO();
  io.to(roomCode).emit('auction:status', { status: 'active' });

  await bringNextPlayer(session, io, roomCode);

  const playerCount = await Player.countDocuments({ _id: { $in: poolIds }, status: { $in: ['available', 'in-auction'] } });
  return { playerCount };
};

const cancelAcceleratedMode = (roomCode) => {
  acceleratedStore.reset(roomCode);
  return { ok: true };
};

module.exports = {
  applyWithdraw,
  emitWithdrawState,
  getSession,
  startAuction,
  pauseAuction,
  resumeAuction,
  endAuction,
  openAcceleratedSelection,
  beginAcceleratedAuction,
  cancelAcceleratedMode,
};
