const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { getIO } = require('../socket');
const timer = require('../socket/auctionTimer');
const { getAssignedTeamIds } = require('../socket/roomStore');
const { getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer, MAX_OVERSEAS_SQUAD, MAX_OVERSEAS_PLAYING } = require('../utils/teamRules');

const NEXT_PLAYER_DELAY_MS = 3000;

const pickRandomPlayer = async () => {
  const [nextSet] = await Player.aggregate([
    { $match: { status: { $in: ['available', 'unsold'] } } },
    {
      $group: {
        _id: null,
        minSetOrder: { $min: '$auctionSetOrder' },
      },
    },
  ]);

  if (nextSet?.minSetOrder == null) {
    const fallbackResults = await Player.aggregate([
      { $match: { status: { $in: ['available', 'unsold'] } } },
      { $sample: { size: 1 } },
    ]);
    return fallbackResults[0] ? await Player.findById(fallbackResults[0]._id) : null;
  }

  const results = await Player.aggregate([
    {
      $match: {
        status: { $in: ['available', 'unsold'] },
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

const emitWithdrawState = async (io, session, extra = {}) => {
  io.emit('auction:withdraw-updated', {
    withdrawnTeams: await serializeWithdrawnTeams(session.withdrawnTeams),
    highestBidder: session.currentHighestBidder ? String(session.currentHighestBidder) : null,
    ...extra,
  });
};

const getWithdrawalState = (session) => {
  const assignedTeamIds = getAssignedTeamIds();
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

const bringNextPlayer = async (session, io) => {
  const player = await pickRandomPlayer();

  if (!player) {
    timer.stop();
    session.status = 'completed';
    session.currentPlayer = null;
    session.withdrawnTeams = [];
    await session.save();
    io.emit('auction:completed');
    return;
  }

  timer.stop();

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

  io.emit('auction:nextPlayer', {
    player: player.toObject(),
    currentBid: session.currentBid,
    timerDuration: session.timerDuration,
    timerEndsAt: endsAt,
    minNextBid: getMinNextBid(session.currentBid, false),
    withdrawnTeams: [],
  });

  timer.start(io, session.timerDuration, makeExpireCallback());
};

const executeSale = async (session) => {
  const player = await Player.findById(session.currentPlayer);
  const team = await Team.findById(session.currentHighestBidder);

  if (!player) throw new Error('Player not found');
  if (!team) throw new Error('No team has placed a bid');

  const finalBid = normalizeBidAmount(session.currentBid);
  if (team.remainingPurse < finalBid) throw new Error('Insufficient purse');

  const eligibility = await canTeamBuyPlayer(team._id, player);
  if (!eligibility.allowed) {
    throw new Error(
      eligibility.reason === 'playing12'
        ? `Playing-12 overseas limit reached (${MAX_OVERSEAS_PLAYING})`
        : `Overseas squad limit reached (${MAX_OVERSEAS_SQUAD})`
    );
  }

  player.status = 'sold';
  player.team = team._id;
  player.soldPrice = finalBid;
  await player.save();

  team.remainingPurse = normalizeBidAmount(team.remainingPurse - finalBid);
  team.players.push(player._id);
  await team.save();

  session.soldPlayers.push(player._id);
  session.currentPlayer = null;
  session.currentBid = 0;
  session.currentHighestBidder = null;
  session.bids = [];
  session.withdrawnTeams = [];
  session.timerEndsAt = null;
  await session.save();

  return { player: player.toObject(), team: team.toObject() };
};

const executeUnsold = async (session) => {
  const player = await Player.findById(session.currentPlayer);
  if (player) {
    player.status = 'available';
    await player.save();
  }

  session.unsoldPlayers.push(session.currentPlayer);
  session.currentPlayer = null;
  session.currentBid = 0;
  session.currentHighestBidder = null;
  session.bids = [];
  session.withdrawnTeams = [];
  session.timerEndsAt = null;
  await session.save();

  return player ? player.toObject() : null;
};

const finishCurrentPlayer = async ({ io, session, mode, auto = false, reason = null }) => {
  timer.stop();

  if (mode === 'sold') {
    const { player, team } = await executeSale(session);
    io.emit('auction:sold', { player, team, amount: player.soldPrice, auto, reason });
  } else {
    const player = await executeUnsold(session);
    io.emit('auction:unsold', { player, auto, reason });
  }

  await emitWithdrawState(io, session, { reason: 'reset' });

  setTimeout(async () => {
    try {
      const fresh = await AuctionSession.findOne();
      if (fresh && fresh.status === 'active') {
        await bringNextPlayer(fresh, io);
      }
    } catch (err) {
      console.error('[auction] bringNextPlayer error:', err.message);
    }
  }, NEXT_PLAYER_DELAY_MS);
};

const applyWithdraw = async (teamId) => {
  const session = await AuctionSession.findOne();
  if (!session || session.status !== 'active' || !session.currentPlayer) {
    return { error: 'Auction is not active' };
  }

  const assignedTeamIds = getAssignedTeamIds();
  const normalizedTeamId = String(teamId);
  if (!assignedTeamIds.includes(normalizedTeamId)) {
    return { error: 'You are not assigned to a team in this room' };
  }

  const alreadyWithdrawn = (session.withdrawnTeams || []).some(
    (withdrawnTeamId) => String(withdrawnTeamId) === normalizedTeamId
  );

  if (!alreadyWithdrawn) {
    session.withdrawnTeams.push(teamId);
    await session.save();
  }

  const io = getIO();
  const withdrawalState = getWithdrawalState(session);
  await emitWithdrawState(io, session);

  if (withdrawalState.everyoneWithdrawn) {
    await finishCurrentPlayer({ io, session, mode: 'unsold', reason: 'all-withdrew' });
    return { session, resolved: 'unsold' };
  }

  if (withdrawalState.allNonLeadingWithdrawn) {
    await finishCurrentPlayer({ io, session, mode: 'sold', reason: 'others-withdrew' });
    return { session, resolved: 'sold' };
  }

  return { session, resolved: null };
};

const makeExpireCallback = () => async () => {
  const io = getIO();
  let session;

  try {
    session = await AuctionSession.findOne();
    if (!session || !session.currentPlayer) return;

    await finishCurrentPlayer({
      io,
      session,
      mode: session.currentHighestBidder ? 'sold' : 'unsold',
      auto: true,
      reason: 'timer-expired',
    });
  } catch (err) {
    console.error('[auction] timer expire error:', err.message);
    try {
      if (session?.currentPlayer) {
        await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
        session.currentPlayer = null;
        session.currentBid = 0;
        session.currentHighestBidder = null;
        session.bids = [];
        session.withdrawnTeams = [];
        session.timerEndsAt = null;
        await session.save();
      }
    } catch (recErr) {
      console.error('[auction] recovery error:', recErr.message);
    }
  }
};

const getSession = async (req, res) => {
  try {
    const session = await AuctionSession.findOne()
      .populate('currentPlayer')
      .populate('currentHighestBidder', 'name shortName color')
      .populate('soldPlayers', 'name role soldPrice')
      .populate('unsoldPlayers', 'name role');

    if (!session) {
      return res.json(null);
    }

    const plain = session.toObject();
    plain.timeLeft = timer.getTimeLeft();
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
    let session = await AuctionSession.findOne();
    if (!session) session = new AuctionSession();

    if (session.status === 'active') {
      return res.status(400).json({ message: 'Auction already running' });
    }

    await Player.updateMany({ status: 'in-auction' }, { $set: { status: 'available' } });

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
    io.emit('auction:status', { status: 'active' });
    await bringNextPlayer(session, io);

    res.json({ message: 'Auction started' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const pauseAuction = async (req, res) => {
  try {
    const session = await AuctionSession.findOne();
    if (!session || session.status !== 'active') {
      return res.status(400).json({ message: 'Auction is not active' });
    }

    timer.stop();
    session.status = 'paused';
    session.timerEndsAt = null;
    await session.save();

    getIO().emit('auction:status', { status: 'paused' });
    res.json({ status: 'paused' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const resumeAuction = async (req, res) => {
  try {
    const session = await AuctionSession.findOne();
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

      timer.start(io, session.timerDuration, makeExpireCallback());
      io.emit('auction:resumed', {
        timerDuration: session.timerDuration,
        timerEndsAt: endsAt,
        currentBid: session.currentBid,
        minNextBid: getMinNextBid(session.currentBid, !!session.currentHighestBidder),
        highestBidder: session.currentHighestBidder || null,
      });
      await emitWithdrawState(io, session);
    } else {
      await session.save();
      await bringNextPlayer(session, io);
    }

    io.emit('auction:status', { status: 'active' });
    res.json({ status: 'active' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const endAuction = async (req, res) => {
  try {
    const session = await AuctionSession.findOne();
    if (!session || session.status === 'completed') {
      return res.status(400).json({ message: 'Auction is already completed or not started' });
    }

    timer.stop();

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

    const io = getIO();
    await emitWithdrawState(io, session, { reason: 'reset' });
    io.emit('auction:completed');
    res.json({ status: 'completed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  applyWithdraw,
  emitWithdrawState,
  getSession,
  startAuction,
  pauseAuction,
  resumeAuction,
  endAuction,
};
