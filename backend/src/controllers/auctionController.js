const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { getIO } = require('../socket');
const timer = require('../socket/auctionTimer');
const { getAssignedTeamIds } = require('../socket/roomStore');
const { getMinNextBid, normalizeBidAmount } = require('../utils/bidRules');
const { canTeamBuyPlayer, MAX_OVERSEAS_PLAYING } = require('../utils/teamRules');

// ── Playing-12 auto-selection ──────────────────────────────────────────────────
// Picks the best 12-player subset while enforcing STRICTLY ≤ 4 overseas.
// If not enough Indian players exist to fill 8 domestic slots, leave empty.
//
// Algorithm:
//   1. Seed: previous playing-12 (score can only go up) or greedy if first time
//   2. Direct replacement: for each bench player, if a same-role player in the
//      playing 12 has strictly worse composite stats, swap them unconditionally.
//      This guarantees a 9/9/9 bowler always replaces an 8/8/8 bowler.
//   3. Hill-climbing with rawFinal (full-precision, no rounding) to catch any
//      remaining improvements the direct pass misses.
const { scoreBreakdown, playerOverallComposite, playerBowlingComposite, playerBattingComposite } = require('../utils/teamScoring');

const computePlaying12 = async (teamId, previousPlaying12Ids = []) => {
  const allPlayers = await Player.find({ team: teamId, status: 'sold' }).lean();

  const isOverseas = (p) => {
    const nat = String(p.nationality || '').trim().toLowerCase();
    return nat.length > 0 && nat !== 'indian';
  };

  // ── STRICT 4-overseas cap: if not enough Indians, leave slots empty ─────
  const indianPlayers   = allPlayers.filter((p) => !isOverseas(p));
  const overseasPlayers = allPlayers.filter(isOverseas);

  // We can play at most MAX_OVERSEAS_PLAYING. The rest can be filled entirely by Indians.
  const maxAllowedOverseas = Math.min(MAX_OVERSEAS_PLAYING, overseasPlayers.length);
  const targetSize = Math.min(12, maxAllowedOverseas + indianPlayers.length);

  if (allPlayers.length <= targetSize) {
    // Squad is small enough — just verify overseas cap
    if (overseasPlayers.length <= MAX_OVERSEAS_PLAYING) {
      return allPlayers.map((p) => p._id);
    }
    // Too many overseas for the squad size — pick best overseas up to cap + all Indians
    const topOverseas = [...overseasPlayers]
      .sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a))
      .slice(0, MAX_OVERSEAS_PLAYING);
    return [...indianPlayers, ...topOverseas].map((p) => p._id);
  }

  const playerById = new Map(allPlayers.map((p) => [String(p._id), p]));
  const prevIds    = new Set((previousPlaying12Ids || []).map(String));

  // ─ Step 1: Seed ─────────────────────────────────────────────────────────
  let playing = [];
  let bench   = [];

  const prevPlaying = (previousPlaying12Ids || [])
    .map((id) => playerById.get(String(id)))
    .filter(Boolean);

  if (prevPlaying.length === targetSize &&
      prevPlaying.filter(isOverseas).length <= MAX_OVERSEAS_PLAYING) {
    playing = [...prevPlaying];
    bench   = allPlayers.filter((p) => !prevIds.has(String(p._id)));
  } else {
    // Greedy seed
    const sorted = [...allPlayers].sort(
      (a, b) => playerOverallComposite(b) - playerOverallComposite(a)
    );
    let overseas = 0;
    for (const p of sorted) {
      if (playing.length >= targetSize) {
        bench.push(p);
      } else if (isOverseas(p) && overseas >= MAX_OVERSEAS_PLAYING) {
        bench.push(p);
      } else {
        playing.push(p);
        if (isOverseas(p)) overseas++;
      }
    }
    // Backfill with Indians only if needed
    while (playing.length < targetSize && bench.length > 0) {
      const nextIndian = bench.findIndex((p) => !isOverseas(p));
      if (nextIndian === -1) break; // no more Indians — leave slot empty
      playing.push(bench.splice(nextIndian, 1)[0]);
    }
  }

  // ─ Step 2: Direct role-based replacement ────────────────────────────────
  // Role-specific phases are the DOMINANT factor.
  // Impact (clutch, match_winner, consistency) is a secondary tiebreaker
  // scaled to 0–1 range so it never overrides the role phases.
  //
  // Example: 9/9/9 bowler (bowling=27) + 0 impact = 27.0
  //          8/8/8 bowler (bowling=24) + 10/10/10 impact = 25.0
  //          → 9/9/9 wins regardless of impact.
  //   But:   8/8/8 with clutch=9 (24 + 0.9 = 24.9) beats
  //          8/8/8 with clutch=3 (24 + 0.3 = 24.3) as a tiebreaker.
  const impactFactor = (p) => {
    const mw = p.role_impact?.match_winner ?? 0;
    const cl = p.role_impact?.clutch ?? 0;
    const co = p.role_impact?.consistency ?? 0;
    return (mw + cl + co) / 30; // normalized to 0–1
  };

  const roleScore = (p) => {
    const impact = impactFactor(p);
    if (p.role === 'Bowler')  return playerBowlingComposite(p) + impact;
    if (p.role === 'Batsman' || p.role === 'Wicket-Keeper') return playerBattingComposite(p) + impact;
    return playerOverallComposite(p) + impact; // All-Rounder
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (let j = 0; j < bench.length; j++) {
      const benchPlayer = bench[j];
      const benchRS     = roleScore(benchPlayer);
      const benchIsOverseas = isOverseas(benchPlayer);

      // Find the worst same-role player currently in the playing 12
      let worstIdx   = -1;
      let worstRS    = Infinity;

      for (let i = 0; i < playing.length; i++) {
        if (playing[i].role !== benchPlayer.role) continue;
        const s = roleScore(playing[i]);
        if (s < worstRS) {
          worstRS  = s;
          worstIdx = i;
        }
      }

      if (worstIdx === -1 || benchRS <= worstRS) continue;

      // Check overseas constraint after swap
      const worstIsOverseas = isOverseas(playing[worstIdx]);
      if (benchIsOverseas && !worstIsOverseas) {
        // Adding an overseas — would exceed cap?
        if (playing.filter(isOverseas).length >= MAX_OVERSEAS_PLAYING) continue;
      }

      // Swap — strictly better player of the same role
      const evicted = playing[worstIdx];
      playing[worstIdx] = benchPlayer;
      bench[j] = evicted;
      changed = true;
    }
  }

  // ─ Step 3: Hill-climbing with FULL PRECISION score ──────────────────────
  // Uses rawFinal (not rounded) so that even tiny gains from swapping a
  // 8-rated player with a 9-rated player are captured correctly.
  const teamScore = (squad) => {
    try { return scoreBreakdown(squad).rawFinal; } catch { return 0; }
  };

  let bestScore = teamScore(playing);
  const MAX_ITER = 6;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let bestSwapScore = bestScore;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < playing.length; i++) {
      // Yield to Node.js Event Loop to prevent the Express server from freezing 
      // during heavy DP math, keeping the auction sockets instantly responsive.
      await new Promise(resolve => setImmediate(resolve)); 

      for (let j = 0; j < bench.length; j++) {
        const candidate = [...playing];
        candidate[i] = bench[j];

        // STRICT 4-overseas cap
        if (candidate.filter(isOverseas).length > MAX_OVERSEAS_PLAYING) continue;

        const swapScore = teamScore(candidate);
        if (swapScore > bestSwapScore) {
          bestSwapScore = swapScore;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI === -1) break;

    const evicted   = playing[bestI];
    playing[bestI]  = bench[bestJ];
    bench[bestJ]    = evicted;
    bestScore       = bestSwapScore;
  }

  return playing.map((p) => p._id);
};



const NEXT_PLAYER_DELAY_MS = 200;

const pickRandomPlayer = async () => {
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
      `Overseas squad limit reached (max ${eligibility.cap ?? 8} overseas per squad)`
    );
  }

  player.status = 'sold';
  player.team = team._id;
  player.soldPrice = finalBid;
  await player.save();

  team.remainingPurse = normalizeBidAmount(team.remainingPurse - finalBid);
  team.players.push(player._id);

  // Save the new player immediately so auction moves fast.
  await team.save();

  // Recompute the optimal playing 12 asynchronously in the background.
  // The host clicking 'Recalculate Ratings' will manually compute diffs anyway.
  const prevPlaying12Ids = (team.playing12 || []).map((id) => String(id));
  computePlaying12(team._id, prevPlaying12Ids)
    .then(async (playing12Ids) => {
      team.playing12 = playing12Ids;
      await team.save();
    })
    .catch((err) => console.error('[bg-computePlaying12]', err.message));

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
    player.status = 'unsold';
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
  if (!session || !session.currentPlayer) {
    return { error: 'Auction is not active' };
  }
  if (session.status !== 'active') {
    return { error: session.status === 'paused' ? 'Auction is paused' : 'Auction is not active' };
  }

  const assignedTeamIds = getAssignedTeamIds();
  const normalizedTeamId = String(teamId);
  if (!assignedTeamIds.includes(normalizedTeamId)) {
    return { error: 'You are not assigned to a team in this room' };
  }

  if (session.currentHighestBidder && String(session.currentHighestBidder) === normalizedTeamId) {
    return { error: 'The current highest bidder cannot withdraw' };
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
  computePlaying12,
};
