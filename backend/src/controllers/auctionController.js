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
const {
  canOccupyBattingPosition,
  playerBattingScoreForPosition,
  scoreBreakdown,
  playerOverallComposite,
  playerBowlingComposite,
  playerBattingComposite,
} = require('../utils/teamScoring');

const RANKING_SEARCH_POOL_SIZE = 16;
const RANKING_EXACT_MAX_EVALS = 2000;
const RANKING_EXACT_YIELD_EVERY = 50;
const RANKING_EXACT_TIME_BUDGET_MS = 5000;

// ── Core optimizer — pure, no DB calls ───────────────────────────────────────
// allPlayers : player objects already in memory
// prevIds    : previous playing-12 IDs (warm-start seed)
// objFn      : optional objective (squad => number). Defaults to scoreBreakdown rawFinal.
// Returns    : array of player objects (the optimal playing 12)
const computeBestPlaying12 = async (allPlayers, previousPlaying12Ids = [], objFn = null, skip2opt = false) => {
  const isOverseas = (p) => {
    const nat = String(p.nationality || '').trim().toLowerCase();
    return nat.length > 0 && nat !== 'indian';
  };

  const indianPlayers   = allPlayers.filter((p) => !isOverseas(p));
  const overseasPlayers = allPlayers.filter(isOverseas);
  const maxAllowedOverseas = Math.min(MAX_OVERSEAS_PLAYING, overseasPlayers.length);
  const targetSize = Math.min(12, maxAllowedOverseas + indianPlayers.length);

  if (allPlayers.length <= targetSize) {
    if (overseasPlayers.length <= MAX_OVERSEAS_PLAYING) return allPlayers;
    const topOverseas = [...overseasPlayers]
      .sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a))
      .slice(0, MAX_OVERSEAS_PLAYING);
    return [...indianPlayers, ...topOverseas];
  }

  const playerById = new Map(allPlayers.map((p) => [String(p._id), p]));

  // Always use the exact scorer — scoreBreakdownFast (greedy batting order) was
  // previously used during hill-climbing but produced an inaccurate objective,
  // causing the optimizer to converge to the wrong local optimum.
  const scoreFn = objFn
    ? (squad) => { try { return objFn(squad); } catch { return 0; } }
    : (squad) => { try { return scoreBreakdown(squad).rawFinal; } catch { return 0; } };
  const exactScoreFn = scoreFn; // same function — no separate "exact" path needed

  const impactFactor = (p) =>
    ((p.role_impact?.match_winner ?? 0) + (p.role_impact?.clutch ?? 0) + (p.role_impact?.consistency ?? 0)) / 30;
  const roleScore = (p) => {
    const imp = impactFactor(p);
    if (p.role === 'Bowler') return playerBowlingComposite(p) + imp;
    if (p.role === 'Batsman' || p.role === 'Wicket-Keeper') return playerBattingComposite(p) + imp;
    return playerOverallComposite(p) + imp;
  };
  const overseasCount = (squad) => squad.filter(isOverseas).length;
  const playerSearchValue = (p) => {
    const fitness =
      ((p.fitness?.stamina ?? 0) + (10 - (p.fitness?.injury_risk ?? 10))) / 2;
    return (
      playerOverallComposite(p) +
      roleScore(p) * 0.8 +
      (p.tactical?.captaincy ?? 0) * 3 +
      (p.tactical?.overs ?? 0) * 1.5 +
      (p.tactical?.flexibility ?? 0) * 1.5 +
      fitness +
      impactFactor(p) * 10
    );
  };

  const addCandidateIfAllowed = (selected, player, limits) => {
    if (!player) return false;
    const id = String(player._id);
    if (selected.has(id)) return false;

    const overseas = isOverseas(player);
    const currentPlayers = Array.from(selected.values());
    const overseasInPool = currentPlayers.filter(isOverseas).length;
    const indianInPool = currentPlayers.length - overseasInPool;

    if (overseas && overseasInPool >= limits.maxOverseasPool) return false;
    if (!overseas && indianInPool >= limits.maxIndianPool) return false;

    selected.set(id, player);
    return true;
  };

  const buildRankingSearchPool = (seedPlayers) => {
    if (allPlayers.length <= RANKING_SEARCH_POOL_SIZE) {
      return [...allPlayers];
    }

    const minIndianNeeded = targetSize - maxAllowedOverseas;
    const limits = {
      maxOverseasPool: Math.min(overseasPlayers.length, Math.max(maxAllowedOverseas + 2, maxAllowedOverseas)),
      maxIndianPool: Math.min(indianPlayers.length, RANKING_SEARCH_POOL_SIZE),
    };
    limits.maxIndianPool = Math.min(
      indianPlayers.length,
      Math.max(minIndianNeeded + 2, RANKING_SEARCH_POOL_SIZE - limits.maxOverseasPool)
    );

    const selected = new Map();
    const bySearch = [...allPlayers].sort((a, b) => playerSearchValue(b) - playerSearchValue(a));
    const byOverall = [...allPlayers].sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a));
    const byBatting = [...allPlayers].sort((a, b) => playerBattingComposite(b) - playerBattingComposite(a));
    const byBowling = [...allPlayers].sort((a, b) => playerBowlingComposite(b) - playerBowlingComposite(a));
    const byImpact = [...allPlayers].sort((a, b) => impactFactor(b) - impactFactor(a));
    const byCaptaincy = [...allPlayers].sort((a, b) => (b.tactical?.captaincy ?? 0) - (a.tactical?.captaincy ?? 0));
    const byFitness = [...allPlayers].sort((a, b) => {
      const fitA = ((a.fitness?.stamina ?? 0) + (10 - (a.fitness?.injury_risk ?? 10))) / 2;
      const fitB = ((b.fitness?.stamina ?? 0) + (10 - (b.fitness?.injury_risk ?? 10))) / 2;
      return fitB - fitA;
    });
    const byBattingSlot = [1, 3, 5, 7, 9].map((position) => (
      [...allPlayers]
        .filter((player) => canOccupyBattingPosition(player, position))
        .sort((a, b) => playerBattingScoreForPosition(b, position) - playerBattingScoreForPosition(a, position))
    ));
    const roleLists = [
      ['Wicket-Keeper', [...allPlayers].filter((p) => p.role === 'Wicket-Keeper').sort((a, b) => playerSearchValue(b) - playerSearchValue(a))],
      ['Batsman', [...allPlayers].filter((p) => p.role === 'Batsman').sort((a, b) => playerSearchValue(b) - playerSearchValue(a))],
      ['All-Rounder', [...allPlayers].filter((p) => p.role === 'All-Rounder').sort((a, b) => playerSearchValue(b) - playerSearchValue(a))],
      ['Bowler', [...allPlayers].filter((p) => p.role === 'Bowler').sort((a, b) => playerSearchValue(b) - playerSearchValue(a))],
    ];

    [...seedPlayers, ...prevPlaying, ...bySearch.slice(0, 6)].forEach((player) => {
      addCandidateIfAllowed(selected, player, limits);
    });

    for (const [, list] of roleLists) {
      for (let i = 0; i < Math.min(3, list.length); i += 1) {
        addCandidateIfAllowed(selected, list[i], limits);
      }
    }

    const metricLists = [bySearch, byOverall, byBatting, byBowling, byImpact, byCaptaincy, byFitness, ...byBattingSlot];
    let cursor = 0;
    while (selected.size < Math.min(RANKING_SEARCH_POOL_SIZE, allPlayers.length)) {
      let addedInRound = false;
      for (const list of metricLists) {
        if (cursor < list.length) {
          addedInRound = addCandidateIfAllowed(selected, list[cursor], limits) || addedInRound;
        }
      }
      cursor += 1;
      if (!addedInRound && cursor >= allPlayers.length) break;
    }

    if (selected.size < Math.min(RANKING_SEARCH_POOL_SIZE, allPlayers.length)) {
      for (const player of bySearch) {
        if (selected.size >= Math.min(RANKING_SEARCH_POOL_SIZE, allPlayers.length)) break;
        addCandidateIfAllowed(selected, player, {
          maxOverseasPool: overseasPlayers.length,
          maxIndianPool: indianPlayers.length,
        });
      }
    }

    return [...selected.values()].sort((a, b) => playerSearchValue(b) - playerSearchValue(a));
  };

  const exhaustiveSearchOnPool = async (pool, initialBest) => {
    const orderedPool = [...pool].sort((a, b) => playerSearchValue(b) - playerSearchValue(a));
    const suffixIndian = new Array(orderedPool.length + 1).fill(0);
    for (let i = orderedPool.length - 1; i >= 0; i -= 1) {
      suffixIndian[i] = suffixIndian[i + 1] + (isOverseas(orderedPool[i]) ? 0 : 1);
    }

    let bestPlayers = [...initialBest];
    let bestScore = exactScoreFn(bestPlayers);
    const chosen = [];
    const minIndianNeeded = targetSize - maxAllowedOverseas;
    let evalCount = 0;
    let nodeCount = 0;
    const startedAt = Date.now();
    let budgetExceeded = false;

    const overBudget = () =>
      evalCount >= RANKING_EXACT_MAX_EVALS ||
      (Date.now() - startedAt) >= RANKING_EXACT_TIME_BUDGET_MS;

    const dfs = async (index, overseasPicked) => {
      if (budgetExceeded) return;
      nodeCount += 1;
      if (nodeCount % RANKING_EXACT_YIELD_EVERY === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (overBudget()) {
          budgetExceeded = true;
          return;
        }
      }

      const chosenCount = chosen.length;
      if (chosenCount === targetSize) {
        evalCount += 1;
        if (overBudget()) {
          budgetExceeded = true;
          return;
        }
        const score = exactScoreFn(chosen);
        if (score > bestScore) {
          bestScore = score;
          bestPlayers = [...chosen];
        }
        return;
      }

      if (index >= orderedPool.length) return;
      const remainingSlots = targetSize - chosenCount;
      const remainingPlayers = orderedPool.length - index;
      if (remainingPlayers < remainingSlots) return;

      const indiansPicked = chosenCount - overseasPicked;
      if (indiansPicked + suffixIndian[index] < minIndianNeeded) return;

      const player = orderedPool[index];

      if (!isOverseas(player) || overseasPicked < MAX_OVERSEAS_PLAYING) {
        chosen.push(player);
        await dfs(index + 1, overseasPicked + (isOverseas(player) ? 1 : 0));
        chosen.pop();
      }

      if (!budgetExceeded && remainingPlayers - 1 >= remainingSlots) {
        await dfs(index + 1, overseasPicked);
      }
    };

    await dfs(0, overseasCount(chosen));
    return bestPlayers;
  };

  const buildGreedySeed = () => {
    const sorted = [...allPlayers].sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a));
    const playing = []; const bench = []; let overseas = 0;
    for (const p of sorted) {
      if (playing.length >= targetSize || (isOverseas(p) && overseas >= MAX_OVERSEAS_PLAYING)) bench.push(p);
      else { playing.push(p); if (isOverseas(p)) overseas++; }
    }
    while (playing.length < targetSize) {
      const idx = bench.findIndex((p) => !isOverseas(p));
      if (idx === -1) break;
      playing.push(bench.splice(idx, 1)[0]);
    }
    return { playing, bench };
  };

  // Optimiser: Phase A (role replacement) + Phase B (1-opt then 2-opt, repeated).
  // Phase B2 (2-opt double-swap) escapes local optima that 1-opt can never escape.
  const optimise = async (seedPlaying, seedBench) => {
    const playing = [...seedPlaying]; const bench = [...seedBench];

    // Phase A: direct role-based replacement
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < bench.length; j++) {
        const bRS = roleScore(bench[j]); const bOvs = isOverseas(bench[j]);
        let worstIdx = -1; let worstRS = Infinity;
        for (let i = 0; i < playing.length; i++) {
          if (playing[i].role !== bench[j].role) continue;
          const s = roleScore(playing[i]); if (s < worstRS) { worstRS = s; worstIdx = i; }
        }
        if (worstIdx === -1 || bRS <= worstRS) continue;
        if (bOvs && !isOverseas(playing[worstIdx]) && overseasCount(playing) >= MAX_OVERSEAS_PLAYING) continue;
        const ev = playing[worstIdx]; playing[worstIdx] = bench[j]; bench[j] = ev; changed = true;
      }
    }

    let bestScore = scoreFn(playing);
    let outerImproved = true;

    while (outerImproved) {
      outerImproved = false;

      // Phase B1: 1-opt single swaps to convergence.
      // Evaluates every (playing[i], bench[j]) pair — no role-based early-exit
      // since a lower-composite player at their preferred batting position can
      // still improve team score (position-fit bonus outweighs raw stat gap).
      let singleImproved = true;
      while (singleImproved) {
        singleImproved = false;
        let best1Score = bestScore; let bestI = -1; let bestJ = -1;
        for (let i = 0; i < playing.length; i++) {
          await new Promise(resolve => setImmediate(resolve));
          for (let j = 0; j < bench.length; j++) {
            const cand = [...playing]; cand[i] = bench[j];
            if (overseasCount(cand) > MAX_OVERSEAS_PLAYING) continue;
            const s = scoreFn(cand);
            if (s > best1Score) { best1Score = s; bestI = i; bestJ = j; }
          }
        }
        if (bestI !== -1) {
          const ev = playing[bestI]; playing[bestI] = bench[bestJ]; bench[bestJ] = ev;
          bestScore = best1Score; singleImproved = true; outerImproved = true;
        }
      }

      // Phase B2: 2-opt — all pairs of simultaneous swaps to escape local optima
      // Skipped in squad mode (skip2opt=true) — O(n²·m²) is too expensive for informational rankings.
      if (!skip2opt) {
        let best2Score = bestScore;
        let bI1 = -1; let bI2 = -1; let bJ1 = -1; let bJ2 = -1;
        for (let i1 = 0; i1 < playing.length; i1++) {
          await new Promise(resolve => setImmediate(resolve));
          for (let i2 = i1 + 1; i2 < playing.length; i2++) {
            for (let j1 = 0; j1 < bench.length; j1++) {
              for (let j2 = j1 + 1; j2 < bench.length; j2++) {
                const cand = [...playing]; cand[i1] = bench[j1]; cand[i2] = bench[j2];
                if (overseasCount(cand) > MAX_OVERSEAS_PLAYING) continue;
                const s = scoreFn(cand);
                if (s > best2Score) { best2Score = s; bI1 = i1; bI2 = i2; bJ1 = j1; bJ2 = j2; }
              }
            }
          }
        }
        if (bI1 !== -1) {
          const e1 = playing[bI1]; const e2 = playing[bI2];
          playing[bI1] = bench[bJ1]; playing[bI2] = bench[bJ2];
          bench[bJ1] = e1; bench[bJ2] = e2;
          bestScore = best2Score; outerImproved = true;
        }
      }
    }

    return { playing, score: bestScore };
  };

  // Random-restart seed: shuffles all players then greedily fills 12 while
  // respecting the overseas cap. Helps escape local optima that every
  // greedy/previous seed converges to.
  const buildRandomSeed = () => {
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    const playing = []; const bench = []; let overseas = 0;
    for (const p of shuffled) {
      if (playing.length >= targetSize || (isOverseas(p) && overseas >= MAX_OVERSEAS_PLAYING)) bench.push(p);
      else { playing.push(p); if (isOverseas(p)) overseas += 1; }
    }
    while (playing.length < targetSize && bench.length > 0) {
      const idx = bench.findIndex((p) => !isOverseas(p));
      if (idx === -1) break;
      playing.push(bench.splice(idx, 1)[0]);
    }
    return { playing, bench };
  };

  const seeds = [];
  const prevIds     = new Set((previousPlaying12Ids || []).map(String));
  const prevPlaying = (previousPlaying12Ids || []).map((id) => playerById.get(String(id))).filter(Boolean);
  const prevBench   = allPlayers.filter((p) => !prevIds.has(String(p._id)));

  if (prevPlaying.length > 0 && overseasCount(prevPlaying) <= MAX_OVERSEAS_PLAYING) {
    const padPlaying = [...prevPlaying]; const padBench = [...prevBench];
    while (padPlaying.length < targetSize && padBench.length > 0) {
      padBench.sort((a, b) => playerOverallComposite(b) - playerOverallComposite(a));
      const next = padBench.shift();
      if (isOverseas(next) && overseasCount(padPlaying) >= MAX_OVERSEAS_PLAYING) continue;
      padPlaying.push(next);
    }
    if (padPlaying.length === targetSize) seeds.push({ playing: padPlaying, bench: padBench });
  }
  seeds.push(buildGreedySeed());
  // Two random restarts — independent starting points reduce local-optima risk.
  seeds.push(buildRandomSeed());
  seeds.push(buildRandomSeed());

  let best = null;
  for (const seed of seeds) {
    const result = await optimise(seed.playing, seed.bench);
    if (!best || result.score > best.score) best = result;
  }

  // Exhaustive DFS over the best 16-player search pool — always run, not just in
  // fastMode. The 1-opt finds a good local optimum; the DFS guarantees we haven't
  // missed the true best subset within the top candidate pool.
  const searchPool = buildRankingSearchPool(best?.playing ?? []);
  const bestFromSearch = await exhaustiveSearchOnPool(searchPool, best?.playing ?? seeds[0].playing);
  const searchedScore = exactScoreFn(bestFromSearch);
  if (!best || searchedScore > best.score) {
    best = { playing: bestFromSearch, score: searchedScore };
  }

  // Final safety: raw previous 12 always wins if it scores higher
  if (prevPlaying.length === targetSize && overseasCount(prevPlaying) <= MAX_OVERSEAS_PLAYING) {
    if (exactScoreFn(prevPlaying) > best.score) return prevPlaying;
  }

  return best.playing;
};

// DB-backed wrapper — used by ranking generation and live auction.
const computePlaying12 = async (teamId, previousPlaying12Ids = [], skip2opt = false) => {
  const allPlayers = await Player.find({ team: teamId, status: 'sold' }).lean();
  const playing    = await computeBestPlaying12(allPlayers, previousPlaying12Ids, null, skip2opt);
  return playing.map((p) => p._id);
};




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
    Team.findById(teamIdToBuy),
  ]);

  if (!player) throw new Error('Player not found');
  if (!team)   throw new Error('Team not found');

  const finalBid = normalizeBidAmount(session.currentBid);
  if (team.remainingPurse < finalBid) throw new Error('Insufficient purse');

  const eligibility = await canTeamBuyPlayer(team._id, player);
  if (!eligibility.allowed) {
    throw new Error(`Overseas squad limit reached (max ${eligibility.cap ?? 8} overseas per squad)`);
  }

  player.status    = 'sold';
  player.team      = team._id;
  player.soldPrice = finalBid;
  await player.save();

  team.remainingPurse = normalizeBidAmount(team.remainingPurse - finalBid);
  team.players.push(player._id);
  await team.save();

  return { player: player.toObject(), team: team.toObject() };
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
  computePlaying12,
  computeBestPlaying12,
  openAcceleratedSelection,
  beginAcceleratedAuction,
  cancelAcceleratedMode,
};
