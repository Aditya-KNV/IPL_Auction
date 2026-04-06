const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { getIO } = require('../socket');
const timer = require('../socket/auctionTimer');
const { getAssignedTeamIds } = require('../socket/roomStore');
const acceleratedStore = require('../socket/acceleratedStore');
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

  const maxAllowedOverseas = Math.min(MAX_OVERSEAS_PLAYING, overseasPlayers.length);
  const targetSize = Math.min(12, maxAllowedOverseas + indianPlayers.length);

  if (allPlayers.length <= targetSize) {
    if (overseasPlayers.length <= MAX_OVERSEAS_PLAYING) {
      return allPlayers.map((p) => p._id);
    }
    const topOverseas = [...overseasPlayers]
      .sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a))
      .slice(0, MAX_OVERSEAS_PLAYING);
    return [...indianPlayers, ...topOverseas].map((p) => p._id);
  }

  const playerById = new Map(allPlayers.map((p) => [String(p._id), p]));

  // ── Shared helpers ────────────────────────────────────────────────────────
  const teamScore = (squad) => {
    try { return scoreBreakdown(squad).rawFinal; } catch { return 0; }
  };

  const impactFactor = (p) => {
    const mw = p.role_impact?.match_winner ?? 0;
    const cl = p.role_impact?.clutch ?? 0;
    const co = p.role_impact?.consistency ?? 0;
    return (mw + cl + co) / 30; // normalized 0–1
  };

  // Role-dominant score: bowling phases dominate for Bowlers, batting for Batsmen/WK.
  // Impact is a secondary tiebreaker (scaled 0–1 so it never overrides role phases).
  // Example: 9/9/9 bowler (27.0) always beats 8/8/8 bowler (24.x) regardless of impact.
  const roleScore = (p) => {
    const impact = impactFactor(p);
    if (p.role === 'Bowler')  return playerBowlingComposite(p) + impact;
    if (p.role === 'Batsman' || p.role === 'Wicket-Keeper') return playerBattingComposite(p) + impact;
    return playerOverallComposite(p) + impact; // All-Rounder
  };

  const overseasCount = (squad) => squad.filter(isOverseas).length;

  // ── Seed builder: greedy by overall composite respecting overseas cap ────
  const buildGreedySeed = () => {
    const sorted = [...allPlayers].sort(
      (a, b) => playerOverallComposite(b) - playerOverallComposite(a)
    );
    const playing = [];
    const bench   = [];
    let overseas  = 0;
    for (const p of sorted) {
      if (playing.length >= targetSize || (isOverseas(p) && overseas >= MAX_OVERSEAS_PLAYING)) {
        bench.push(p);
      } else {
        playing.push(p);
        if (isOverseas(p)) overseas++;
      }
    }
    // Backfill with Indians if overseas cap pushed us short
    while (playing.length < targetSize) {
      const idx = bench.findIndex((p) => !isOverseas(p));
      if (idx === -1) break;
      playing.push(bench.splice(idx, 1)[0]);
    }
    return { playing, bench };
  };

  // ── Step 2 (role-replacement) + Step 3 (hill-climb) bundled ─────────────
  // Runs from a given seed all the way to convergence.
  // Returns { playing, score }.
  const optimise = async (seedPlaying, seedBench) => {
    const playing = [...seedPlaying];
    const bench   = [...seedBench];

    // ─ Phase A: Direct role-based replacement ──────────────────────────────
    // For every bench player that is strictly better (by role score) than the
    // weakest same-role player in the playing 12, swap unconditionally.
    // This guarantees a 10/10/10 bowler always beats an 8/8/8 bowler.
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < bench.length; j++) {
        const benchPlayer    = bench[j];
        const benchRS        = roleScore(benchPlayer);
        const benchIsOverseas = isOverseas(benchPlayer);

        let worstIdx = -1;
        let worstRS  = Infinity;
        for (let i = 0; i < playing.length; i++) {
          if (playing[i].role !== benchPlayer.role) continue;
          const s = roleScore(playing[i]);
          if (s < worstRS) { worstRS = s; worstIdx = i; }
        }

        if (worstIdx === -1 || benchRS <= worstRS) continue;

        // Overseas cap check
        if (benchIsOverseas && !isOverseas(playing[worstIdx])) {
          if (overseasCount(playing) >= MAX_OVERSEAS_PLAYING) continue;
        }

        const evicted = playing[worstIdx];
        playing[worstIdx] = benchPlayer;
        bench[j] = evicted;
        changed = true;
      }
    }

    // ─ Phase B: Hill-climbing to full convergence ──────────────────────────
    // Uses rawFinal (full precision) and runs until no single swap improves
    // the score — no artificial iteration cap.
    // Role-score protection: same-role swaps may not downgrade the dominant
    // metric. This stops the raw team score from evicting a 10/10/10 bowler
    // in favour of an 8/8/8 bowler with inflated batting stats.
    let bestScore = teamScore(playing);
    let improved  = true;

    while (improved) {
      improved = false;
      let bestSwapScore = bestScore;
      let bestI = -1;
      let bestJ = -1;

      for (let i = 0; i < playing.length; i++) {
        // Yield to the event loop so live auction sockets stay responsive
        await new Promise(resolve => setImmediate(resolve));

        for (let j = 0; j < bench.length; j++) {
          const candidate = [...playing];
          candidate[i] = bench[j];

          if (overseasCount(candidate) > MAX_OVERSEAS_PLAYING) continue;

          // Role-score protection for same-role swaps
          if (playing[i].role === bench[j].role && roleScore(bench[j]) < roleScore(playing[i])) continue;

          const swapScore = teamScore(candidate);
          if (swapScore > bestSwapScore) {
            bestSwapScore = swapScore;
            bestI = i;
            bestJ = j;
          }
        }
      }

      if (bestI !== -1) {
        const evicted  = playing[bestI];
        playing[bestI] = bench[bestJ];
        bench[bestJ]   = evicted;
        bestScore      = bestSwapScore;
        improved       = true;
      }
    }

    return { playing, score: bestScore };
  };

  // ── Build seeds ───────────────────────────────────────────────────────────
  const seeds = [];

  // Seed A – previous playing 12 (always try it, even if size mismatches,
  // by padding with the best available bench players)
  const prevIds     = new Set((previousPlaying12Ids || []).map(String));
  const prevPlaying = (previousPlaying12Ids || [])
    .map((id) => playerById.get(String(id)))
    .filter(Boolean);
  const prevBench   = allPlayers.filter((p) => !prevIds.has(String(p._id)));

  if (prevPlaying.length > 0 && overseasCount(prevPlaying) <= MAX_OVERSEAS_PLAYING) {
    // Pad up to targetSize if needed (e.g. a new player was just bought)
    const padPlaying = [...prevPlaying];
    const padBench   = [...prevBench];
    while (padPlaying.length < targetSize && padBench.length > 0) {
      // Prefer the highest overall-composite available player
      padBench.sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a));
      const next = padBench.shift();
      if (isOverseas(next) && overseasCount(padPlaying) >= MAX_OVERSEAS_PLAYING) continue;
      padPlaying.push(next);
    }
    if (padPlaying.length === targetSize) {
      seeds.push({ playing: padPlaying, bench: padBench });
    }
  }

  // Seed B – greedy by overall composite
  seeds.push(buildGreedySeed());

  // ── Run optimiser from every seed; keep the best result ──────────────────
  let best = null;

  for (const seed of seeds) {
    const result = await optimise(seed.playing, seed.bench);
    if (!best || result.score > best.score) best = result;
  }

  // Final safety: if the raw previous playing 12 (unchanged) scores higher
  // than everything the optimiser found, keep it as-is.
  if (prevPlaying.length === targetSize && overseasCount(prevPlaying) <= MAX_OVERSEAS_PLAYING) {
    const prevScore = teamScore(prevPlaying);
    if (prevScore > best.score) {
      return prevPlaying.map((p) => p._id);
    }
  }

  return best.playing.map((p) => p._id);
};



const NEXT_PLAYER_DELAY_MS = 200;

const pickRandomPlayer = async () => {
  // ── Accelerated mode: only pick from the curated pool ─────────────────────
  const pool = acceleratedStore.getPool();
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

  // Atomic add — $addToSet prevents duplicates and is race-condition-safe
  const updated = await AuctionSession.findOneAndUpdate(
    { _id: session._id, status: 'active', currentPlayer: { $ne: null } },
    { $addToSet: { withdrawnTeams: teamId } },
    { new: true }
  );
  if (!updated) return { error: 'Auction state changed' };

  const io = getIO();
  const withdrawalState = getWithdrawalState(updated);
  await emitWithdrawState(io, updated);

  if (withdrawalState.everyoneWithdrawn) {
    await finishCurrentPlayer({ io, session: updated, mode: 'unsold', reason: 'all-withdrew' });
    return { session: updated, resolved: 'unsold' };
  }

  if (withdrawalState.allNonLeadingWithdrawn) {
    await finishCurrentPlayer({ io, session: updated, mode: 'sold', reason: 'others-withdrew' });
    return { session: updated, resolved: 'sold' };
  }

  return { session: updated, resolved: null };
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

    // Clear accelerated mode if it was running
    acceleratedStore.reset();

    const io = getIO();
    await emitWithdrawState(io, session, { reason: 'reset' });
    io.emit('auction:completed');
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
const openAcceleratedSelection = async (maxPicks) => {
  const session = await AuctionSession.findOne();
  if (!session) return { error: 'No auction session found' };

  if (session.status !== 'active' && session.status !== 'paused') {
    return { error: 'Auction must be active or paused to use accelerated mode' };
  }

  // Pause if currently running
  if (session.status === 'active') {
    timer.stop();
    session.status = 'paused';
    session.timerEndsAt = null;
    await session.save();
    getIO().emit('auction:status', { status: 'paused' });
  }

  // Fetch all available + unsold players
  const players = await Player.find({ status: { $in: ['available', 'unsold'] } })
    .select('_id name role nationality basePrice')
    .lean();

  const assignedTeamIds = getAssignedTeamIds();
  acceleratedStore.initSelection(players, assignedTeamIds, maxPicks);

  return { players, assignedTeamIds, maxPicks };
};

/**
 * Build the pool from submitted picks, mark unsold selections as available,
 * then start the accelerated auction.
 * Returns { playerCount } or { error }.
 */
const beginAcceleratedAuction = async () => {
  const session = await AuctionSession.findOne();
  if (!session) return { error: 'No auction session found' };

  const pool    = acceleratedStore.buildPool();
  const poolIds = [...pool];

  if (poolIds.length === 0) return { error: 'No players were selected — add picks first' };

  // Mark any unsold selections back to available so the auction can pick them
  await Player.updateMany({ _id: { $in: poolIds }, status: 'unsold' }, { $set: { status: 'available' } });

  // Release any player that was mid-auction back to available
  if (session.currentPlayer) {
    await Player.findByIdAndUpdate(session.currentPlayer, { status: 'available' });
  }

  // Activate the pool filter (pickRandomPlayer will now respect it)
  acceleratedStore.setPool(pool);
  acceleratedStore.clearSelection();

  // Reset session and start fresh
  session.status = 'active';
  session.currentPlayer = null;
  session.currentBid = 0;
  session.currentHighestBidder = null;
  session.bids = [];
  session.withdrawnTeams = [];
  session.timerEndsAt = null;
  await session.save();

  const io = getIO();
  io.emit('auction:status', { status: 'active' });

  await bringNextPlayer(session, io);

  // Count how many pool players are actually available
  const playerCount = await Player.countDocuments({ _id: { $in: poolIds }, status: { $in: ['available', 'in-auction'] } });
  return { playerCount };
};

/**
 * Cancel accelerated mode — clear state, leave auction paused.
 */
const cancelAcceleratedMode = () => {
  acceleratedStore.reset();
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
  computePlaying12,
  openAcceleratedSelection,
  beginAcceleratedAuction,
  cancelAcceleratedMode,
};
