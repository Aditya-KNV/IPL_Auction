const AuctionSession = require('../models/AuctionSession');
const Player         = require('../models/Player');
const Team           = require('../models/Team');
const { getIO }      = require('../socket');
const timer          = require('../socket/auctionTimer');
const { getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer, MAX_OVERSEAS_SQUAD, MAX_OVERSEAS_PLAYING } = require('../utils/teamRules');

const NEXT_PLAYER_DELAY_MS = 3000; // pause after sold/unsold before next player

// ── Pick a random available player ────────────────────────────────────────────

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

  // Backward-compatible fallback for players that were seeded before
  // auctionSetOrder existed.
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

// ── Bring next player up ───────────────────────────────────────────────────────

const bringNextPlayer = async (session, io) => {
  const player = await pickRandomPlayer();

  if (!player) {
    // No players left — auction complete
    timer.stop();
    session.status        = 'completed';
    session.currentPlayer = null;
    await session.save();
    io.emit('auction:completed');
    return;
  }

  timer.stop();

  player.status = 'in-auction';
  await player.save();

  const endsAt = new Date(Date.now() + session.timerDuration * 1000);
  session.currentPlayer        = player._id;
  session.currentBid           = normalizeBidAmount(player.basePrice);
  session.currentHighestBidder = null;
  session.bids                 = [];
  session.timerEndsAt          = endsAt;
  await session.save();

  io.emit('auction:nextPlayer', {
    player:        player.toObject(),
    currentBid:    session.currentBid,
    timerDuration: session.timerDuration,
    timerEndsAt:   endsAt,
    minNextBid:    getMinNextBid(session.currentBid, false),
  });

  timer.start(io, session.timerDuration, makeExpireCallback());
};

// ── Sale / Unsold helpers ─────────────────────────────────────────────────────

const executeSale = async (session) => {
  const player = await Player.findById(session.currentPlayer);
  const team   = await Team.findById(session.currentHighestBidder);

  if (!player) throw new Error('Player not found');
  if (!team)   throw new Error('No team has placed a bid');
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

  player.status    = 'sold';
  player.team      = team._id;
  player.soldPrice = finalBid;
  await player.save();

  team.remainingPurse = normalizeBidAmount(team.remainingPurse - finalBid);
  team.players.push(player._id);
  await team.save();

  session.soldPlayers.push(player._id);
  session.currentPlayer        = null;
  session.currentBid           = 0;
  session.currentHighestBidder = null;
  session.bids                 = [];
  session.timerEndsAt          = null;
  await session.save();

  return { player: player.toObject(), team: team.toObject() };
};

const executeUnsold = async (session) => {
  const player = await Player.findById(session.currentPlayer);
  if (player) {
    player.status = 'available'; // back to pool — can come up again
    await player.save();
  }

  session.unsoldPlayers.push(session.currentPlayer);
  session.currentPlayer        = null;
  session.currentBid           = 0;
  session.currentHighestBidder = null;
  session.bids                 = [];
  session.timerEndsAt          = null;
  await session.save();

  return player ? player.toObject() : null;
};

// ── Timer expire callback — auto-advance ──────────────────────────────────────

const makeExpireCallback = () => async () => {
  const io = getIO();
  let session;

  try {
    session = await AuctionSession.findOne();
    if (!session || !session.currentPlayer) return;

    if (session.currentHighestBidder) {
      const { player, team } = await executeSale(session);
      io.emit('auction:sold', { player, team, amount: player.soldPrice, auto: true });
    } else {
      const player = await executeUnsold(session);
      io.emit('auction:unsold', { player, auto: true });
    }
  } catch (err) {
    console.error('[auction] timer expire error:', err.message);
    // Recovery: free the stuck player so the auction can continue
    try {
      if (session?.currentPlayer) {
        await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
        session.currentPlayer        = null;
        session.currentBid           = 0;
        session.currentHighestBidder = null;
        session.bids                 = [];
        session.timerEndsAt          = null;
        await session.save();
      }
    } catch (recErr) {
      console.error('[auction] recovery error:', recErr.message);
    }
  }

  // Always advance — runs whether or not there was an error above
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

// ── Route handlers ────────────────────────────────────────────────────────────

const getSession = async (req, res) => {
  try {
    const session = await AuctionSession.findOne()
      .populate('currentPlayer')
      .populate('currentHighestBidder', 'name shortName color')
      .populate('soldPlayers',   'name role soldPrice')
      .populate('unsoldPlayers', 'name role');

    if (session) {
      const plain      = session.toObject();
      plain.timeLeft   = timer.getTimeLeft();
      plain.minNextBid = session.currentBid
        ? getMinNextBid(session.currentBid, !!session.currentHighestBidder)
        : 0;
      return res.json(plain);
    }
    res.json(null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const startAuction = async (req, res) => {
  try {
    let session = await AuctionSession.findOne();
    if (!session) session = new AuctionSession();

    if (session.status === 'active')
      return res.status(400).json({ message: 'Auction already running' });

    // Free any players stuck in 'in-auction' from a previous run
    await Player.updateMany({ status: 'in-auction' }, { $set: { status: 'available' } });

    // Reset all fields so a fresh auction can start
    session.status               = 'active';
    session.currentPlayer        = null;
    session.currentBid           = 0;
    session.currentHighestBidder = null;
    session.bids                 = [];
    session.soldPlayers          = [];
    session.unsoldPlayers        = [];
    session.timerEndsAt          = null;
    await session.save();

    const io = getIO();
    io.emit('auction:status', { status: 'active' });

    // Immediately bring up first random player
    await bringNextPlayer(session, io);

    res.json({ message: 'Auction started' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const pauseAuction = async (req, res) => {
  try {
    const session = await AuctionSession.findOne();
    if (!session || session.status !== 'active')
      return res.status(400).json({ message: 'Auction is not active' });

    timer.stop();
    session.status      = 'paused';
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
    if (!session || session.status !== 'paused')
      return res.status(400).json({ message: 'Auction is not paused' });

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
    } else {
      await session.save();
      // No player was up — bring one up now
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
    if (!session || session.status === 'completed')
      return res.status(400).json({ message: 'Auction is already completed or not started' });

    timer.stop();

    // Free the current player back to the pool if one was mid-auction
    if (session.currentPlayer) {
      await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
    }

    session.status               = 'completed';
    session.currentPlayer        = null;
    session.currentBid           = 0;
    session.currentHighestBidder = null;
    session.bids                 = [];
    session.timerEndsAt          = null;
    await session.save();

    getIO().emit('auction:completed');
    res.json({ status: 'completed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSession, startAuction, pauseAuction, resumeAuction, endAuction };
