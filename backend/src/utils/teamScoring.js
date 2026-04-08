const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, decimals = 2) => Number(value.toFixed(decimals));
const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getBattingMetrics = (player) => ({
  powerplay: player.batting?.phases?.powerplay?.rating ?? 0,
  middle: player.batting?.phases?.middle?.rating ?? 0,
  death: player.batting?.phases?.death?.rating ?? 0,
  finishing: player.batting?.skills?.finishing ?? 0,
  power_hitting: player.batting?.skills?.power_hitting ?? 0,
  anchor: player.batting?.skills?.anchor ?? 0,
  spin_play: player.batting?.skills?.spin_play ?? 0,
  pace_play: player.batting?.skills?.pace_play ?? 0,
});

const battingFormulaForPosition = (position) => {
  if ([1, 2].includes(position)) {
    return {
      powerplay: 0.5,
      pace_play: 0.15,
      middle: 0.1,
      anchor: 0.05,
      spin_play: 0.05,
      power_hitting: 0.05,
    };
  }
  if ([3, 4].includes(position)) {
    return {
      middle: 0.4,
      powerplay: 0.2,
      pace_play: 0.1,
      spin_play: 0.1,
      anchor: 0.05,
      power_hitting: 0.05,
    };
  }
  if ([5, 6].includes(position)) {
    return {
      middle: 0.2,
      death: 0.3,
      pace_play: 0.1,
      spin_play: 0.1,
      finishing: 0.05,
      power_hitting: 0.05,
    };
  }
  if ([7, 8].includes(position)) {
    return {
      death: 0.4,
      pace_play: 0.1,
      finishing: 0.1,
      power_hitting: 0.1,
    };
  }
  return {
    power_hitting: 0.6,
    finishing: 0.4,
  };
};

// Per-slot contribution cap toward the 34-point Position Fit total.
// Slot maxes — #1–2: 4.5 pts · #3–7: 4 pts · #8: 3 pts · #9: 1 pt · #10: 0.34 pts · #11–12: 0.33 pts
const POSITION_SLOT_MAX = {
  1: 4.5, 2: 4.5,
  3: 4,   4: 4,
  5: 4,   6: 4,
  7: 4,   8: 3,
  9: 1,   10: 0.34, 11: 0.33, 12: 0.33,
};

const weightedNormalizedScore = (metrics, weights) => {
  const weightEntries = Object.entries(weights);
  const totalWeight = weightEntries.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = weightEntries.reduce((sum, [key, weight]) => sum + (metrics[key] ?? 0) * weight, 0);
  return weighted / totalWeight;
};

const playerBattingScoreForPosition = (player, position) => {
  const weights = battingFormulaForPosition(position);
  return weightedNormalizedScore(getBattingMetrics(player), weights);
};

const optimizeBattingOrder = (players) => {
  const slots = Array.from({ length: 12 }, (_, index) => index + 1);
  const memo = new Map();

  const dfs = (slotIndex, usedMask) => {
    if (slotIndex >= slots.length) return 0;
    const key = `${slotIndex}:${usedMask}`;
    if (memo.has(key)) return memo.get(key);

    const position = slots[slotIndex];
    let best = -8 + dfs(slotIndex + 1, usedMask); // heavy penalty for unfilled slot

    for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
      if (usedMask & (1 << playerIndex)) continue;

      const player = players[playerIndex];

      // Hard position constraints:
      //   Bowlers can ONLY bat at positions 9–12 (lower order)
      //   Batsmen/Wicket-Keepers stay at 1–8 (8 allows overflow when squad has 8+ top-order players)
      //   All-Rounders can stretch to position 9
      if (player.role === 'Bowler' && position < 9) continue;
      if ((player.role === 'Batsman' || player.role === 'Wicket-Keeper') && position > 8) continue;
      const preferred = player.tactical?.positions ?? [];
      const base = preferred.includes(position)
        ? playerBattingScoreForPosition(player, position)
        : playerBattingScoreForPosition(player, position) - 3;
      const slotScore = base;

      best = Math.max(best, slotScore + dfs(slotIndex + 1, usedMask | (1 << playerIndex)));
    }

    memo.set(key, best);
    return best;
  };

  const totalScore = dfs(0, 0);

  // Reconstruct the optimal assignment from the memoised values
  const memoGet = (slotIndex, mask) => (slotIndex >= slots.length ? 0 : (memo.get(`${slotIndex}:${mask}`) ?? 0));

  const assignments = [];
  let usedMask = 0;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const position = slots[slotIndex];
    let bestValue = -8 + memoGet(slotIndex + 1, usedMask); // skip value
    let bestPi = -1;
    let bestSlotScore = 0;

    for (let pi = 0; pi < players.length; pi += 1) {
      if (usedMask & (1 << pi)) continue;
      const player = players[pi];

      // Same hard constraints in reconstruction pass
      if (player.role === 'Bowler' && position < 9) continue;
      if ((player.role === 'Batsman' || player.role === 'Wicket-Keeper') && position > 8) continue;

      const preferred = player.tactical?.positions ?? [];
      const base = preferred.includes(position)
        ? playerBattingScoreForPosition(player, position)
        : playerBattingScoreForPosition(player, position) - 3;
      const slotScore = base;

      const candidate = slotScore + memoGet(slotIndex + 1, usedMask | (1 << pi));
      if (candidate > bestValue) { bestValue = candidate; bestPi = pi; bestSlotScore = slotScore; }
    }

    if (bestPi >= 0) {
      const player = players[bestPi];
      const preferred = player.tactical?.positions ?? [];
      assignments.push({ position, playerIndex: bestPi, isPreferred: preferred.includes(position), slotScore: round(bestSlotScore) });
      usedMask |= (1 << bestPi);
    }
  }

  return { totalScore, assignments };
};

const wicketKeeperScore = (players) => {
  const keepers = players.filter((player) => player.role === 'Wicket-Keeper');
  if (keepers.length > 1) return 3;
  if (keepers.length === 1) {
    return (keepers[0].fitness?.injury_risk ?? 10) <= 3 ? 2.5 : 2;
  }
  return 0;
};

const battingBalanceScore = (players) => {
  // Bowlers are excluded — only batters and all-rounders face the opposition's bowling line
  const batters = players.filter((p) => p.role !== 'Bowler');
  const left = batters.filter((player) => player.batting_style === 'left-handed').length;
  const right = batters.filter((player) => player.batting_style !== 'left-handed').length;
  if (!left || !right) return 0;
  return 3 * (Math.min(left, right) / Math.max(left, right));
};

const battingComposite = (player) => {
  const m = getBattingMetrics(player);
  return Object.values(m).reduce((sum, v) => sum + v, 0);
};

const battingPositionScore = (players) => {
  const candidates = [...players]
    .sort((a, b) => battingComposite(b) - battingComposite(a))
    .slice(0, 15);
  const { assignments } = optimizeBattingOrder(candidates);

  let positionFitScore = 0;

  const battingOrder = assignments.map(({ position, playerIndex, isPreferred, slotScore }) => {
    const p = candidates[playerIndex];
    const slotMax = POSITION_SLOT_MAX[position] ?? 0;
    const contribution = round(Math.max(0, slotScore / 10) * slotMax, 2);
    positionFitScore += contribution;
    return { playerId: String(p._id), name: p.name, position, isPreferred, slotScore, slotMax, contribution };
  }).sort((a, b) => a.position - b.position);

  return { score: round(positionFitScore), battingOrder };
};

const normalizeBowlingStyle = (style = '') => style.toLowerCase().trim();
const isPacer = (style = '') => /(fast|medium)/i.test(style);
const isSpinner = (style = '') => /(spin|orthodox|break|googly|chinaman)/i.test(style);
const bowlingArm = (style = '') => {
  if (/left-arm|left arm/i.test(style)) return 'left';
  if (/right-arm|right arm/i.test(style)) return 'right';
  return 'unknown';
};

// ── Bowling category helpers used by bench-strength logic ────────────────────
// Returns 'spinner' | 'pacer' | null
const bowlingCategory = (style = '') => {
  if (!style) return null;
  if (isSpinner(style)) return 'spinner';
  if (isPacer(style)) return 'pacer';
  return null;
};

// Determine if two bowling styles are compatible backups:
// spinners back up spinners, pacers back up pacers.
const bowlingStylesCompatible = (styleA = '', styleB = '') => {
  const catA = bowlingCategory(styleA);
  const catB = bowlingCategory(styleB);
  if (!catA || !catB) return false;
  return catA === catB;
};

// Returns true if `benchPlayer` is a valid backup for `p12Player`
// given the nationality + role/bowling rules described in the spec.
// keeperCountInXI: number of Wicket-Keepers currently in the Playing 12.
const isValidBackup = (p12Player, benchPlayer, keeperCountInXI = 1) => {
  // Nationality constraint: Indian risk-player => backup must be Indian
  const p12Overseas = p12Player.nationality && p12Player.nationality.toLowerCase() !== 'indian';
  const benchOverseas = benchPlayer.nationality && benchPlayer.nationality.toLowerCase() !== 'indian';
  if (!p12Overseas && benchOverseas) return false; // Indian player needs Indian backup

  const p12Role = p12Player.role;
  const benchRole = benchPlayer.role;

  // Wicket-Keeper backup rule depends on how many keepers are in the XI:
  //   2+ keepers → the other keeper covers WK duties; bench only needs to
  //                replace the batting slot → WK or Batsman both valid.
  //   1 keeper   → no one in the XI can keep; bench MUST include a WK.
  if (p12Role === 'Wicket-Keeper') {
    if (keeperCountInXI >= 2) {
      return benchRole === 'Wicket-Keeper' || benchRole === 'Batsman';
    }
    return benchRole === 'Wicket-Keeper';
  }

  // Pure Batsman: backup must be Batsman or Wicket-Keeper
  if (p12Role === 'Batsman') {
    return benchRole === 'Batsman' || benchRole === 'Wicket-Keeper';
  }

  // Pure Bowler: backup must be a pure Bowler of the same category (pace or spin)
  // All-Rounders are NOT valid backups for bowlers
  if (p12Role === 'Bowler') {
    if (benchRole !== 'Bowler') return false;
    return bowlingStylesCompatible(p12Player.bowling_style, benchPlayer.bowling_style);
  }

  // All-Rounder: ONLY another All-Rounder can be a backup, and bowling categories must match
  // (fast-bowling AR → fast-bowling AR, spin AR → spin AR)
  if (p12Role === 'All-Rounder') {
    if (benchRole !== 'All-Rounder') return false;
    const p12Cat = bowlingCategory(p12Player.bowling_style);
    if (!p12Cat) return true; // AR with no bowling style — any AR is fine
    return bowlingStylesCompatible(p12Player.bowling_style, benchPlayer.bowling_style);
  }

  return false;
};

// Bench Strength scoring (10 pts).
// playing12: array of populated player objects in the Playing 12
// benchPlayers: array of populated player objects NOT in Playing 12 (bench/squad remainder)
const benchStrengthScore = (playing12, benchPlayers) => {
  if (!playing12.length) {
    return { score: 0, backed: 0, total: 0, details: [] };
  }
  const keeperCount = playing12.filter((p) => p.role === 'Wicket-Keeper').length;
  const atRisk = playing12.filter((p) => (p.fitness?.injury_risk ?? 0) > 4);
  if (atRisk.length === 0) {
    return { score: 10, backed: 0, total: 0, details: [] };
  }

  const details = atRisk.map((riskPlayer) => {
    const backup = benchPlayers.find((b) => isValidBackup(riskPlayer, b, keeperCount)) ?? null;
    return {
      playerId: String(riskPlayer._id),
      name: riskPlayer.name,
      role: riskPlayer.role,
      bowling_style: riskPlayer.bowling_style,
      nationality: riskPlayer.nationality,
      injuryRisk: riskPlayer.fitness?.injury_risk ?? 0,
      hasBackup: backup !== null,
      backupName: backup?.name ?? null,
      backupRole: backup?.role ?? null,
    };
  });

  const backed = details.filter((d) => d.hasBackup).length;
  const score = round((backed / atRisk.length) * 10);

  return { score, backed, total: atRisk.length, details };
};

const spinType = (style = '') => {
  if (/(off-spin|off spin|orthodox|offbreak|off break)/i.test(style)) return 'off';
  return 'leg'; // leg-spin, wrist-spin, chinaman, mystery spin, and anything else
};

const totalOversScore = (players) => {
  const overs = players.reduce((sum, player) => sum + (player.tactical?.overs ?? 0), 0);
  if (overs >= 24) return 3;
  if (overs === 23) return 2.5;
  if (overs === 22) return 2;
  if (overs === 21) return 1;
  if (overs === 20) return 0.5;
  return 0;
};

const paceOversScore = (players) => {
  const pacers = players.filter((player) => isPacer(player.bowling_style));
  const overs = pacers.reduce((sum, player) => sum + (player.tactical?.overs ?? 0), 0);

  let score = 0;
  if (overs >= 14) score = 2.5;
  else if (overs === 13) score = 2;
  else if (overs === 12) score = 1.5;
  else if (overs === 11) score = 1;
  else if (overs === 10) score = 0.5;

  const arms = new Set(pacers.map((player) => bowlingArm(player.bowling_style)).filter((arm) => arm !== 'unknown'));
  if (arms.has('left') && arms.has('right')) score += 0.5;

  return clamp(score, 0, 3);
};

const spinOversScore = (players) => {
  const spinners = players.filter((player) => isSpinner(player.bowling_style));
  const overs = spinners.reduce((sum, player) => sum + (player.tactical?.overs ?? 0), 0);

  let score = 0;
  if (overs >= 10) score = 2.5;
  else if (overs === 9) score = 2;
  else if (overs === 8) score = 1.5;
  else if (overs === 7) score = 1;
  else if (overs === 6) score = 0.5;

  const archetypes = new Set(
    spinners
      .map((player) => {
        const arm = bowlingArm(player.bowling_style);
        const type = spinType(player.bowling_style);
        if (arm === 'unknown' || !type) return null;
        return `${type}-${arm}`;
      })
      .filter(Boolean)
  );

  const hasCombo =
    (archetypes.has('off-left') && archetypes.has('leg-right')) ||
    (archetypes.has('off-right') && archetypes.has('leg-left')) ||
    (archetypes.has('off-left') && archetypes.has('off-right')) ||
    (archetypes.has('leg-left') && archetypes.has('leg-right'));

  if (hasCombo) score += 0.5;
  return clamp(score, 0, 3);
};

// Only players who actually bowl (overs > 0) are eligible for phase scores.
// Each phase requires at least 2 eligible bowlers — a single bowler cannot
// cover the required overs alone (powerplay = 6, middle = 10, death = 4).
const eligibleBowlers = (players) => players.filter((p) => (p.tactical?.overs ?? 0) > 0);

// bowling.positions is a 3-element array: [powerplay, middle, death]
// A value of 1 means the bowler is designated for that phase.
// Bowlers not designated for the phase they are bowling in receive a -2 effective rating penalty.
// Returns { score, assigned } where assigned is the top-4 bowler list used for scoring.
const phaseBowlingScoreWithAssignment = (players, phaseKey, positionIndex, multiplier, maxScore) => {
  const bowlers = eligibleBowlers(players);
  if (bowlers.length < 2) return { score: 0, assigned: [] };

  // Build per-bowler entries with effective rating
  const entries = bowlers.map((p) => {
    const base = p.bowling?.phases?.[phaseKey] ?? 0;
    const designated = (p.bowling?.positions?.[positionIndex] ?? 0) === 1;
    return { name: p.name, base, designated, effective: designated ? base : base - 2 };
  });

  // Take top 4 by effective rating
  const top4 = [...entries].sort((a, b) => b.effective - a.effective).slice(0, 4);
  const avg = top4.reduce((s, e) => s + e.effective, 0) / top4.length;
  const score = clamp(avg * multiplier, 0, maxScore);

  return { score, assigned: top4 };
};

const powerplayBowlingScore = (players) => phaseBowlingScoreWithAssignment(players, 'powerplay', 0, 1.0, 10);
const middleBowlingScore    = (players) => phaseBowlingScoreWithAssignment(players, 'middle',    1, 1.1, 11);
const deathBowlingScore     = (players) => phaseBowlingScoreWithAssignment(players, 'death',     2, 1.0, 10);

const playerFitnessComposite = (player) => average([
  player.fitness?.stamina ?? 0,
  10 - (player.fitness?.injury_risk ?? 10),
]);

const playerImpactComposite = (player) => average([
  player.role_impact?.match_winner ?? 0,
  player.role_impact?.clutch ?? 0,
  player.role_impact?.consistency ?? 0,
]);

const fitnessScore = (players) => average(players.map(playerFitnessComposite)) * 0.5;
const impactScore = (players) => average(players.map(playerImpactComposite)) * 0.7;
const tacticalScore = (players) => average(players.map((player) => player.tactical?.flexibility ?? 0)) * 0.3;
const captaincy = (players) => {
  const total = players.reduce((sum, p) => sum + (p.tactical?.captaincy ?? 0), 0);
  if (total <= 0) return 0;
  const steps = Math.floor(Math.max(0, 1.75 - total) / 0.25);
  return Math.max(0, 4 - steps * 0.5);
};
const ageScore = (players) => {
  const averageAge = average(players.map((player) => player.age ?? 0));
  return clamp(1 - (Math.abs(averageAge - 30) / 15), 0, 1);
};

const battingScore = (players) => {
  const wicketKeeper = wicketKeeperScore(players);
  const balance = battingBalanceScore(players);
  const { score: positions, battingOrder } = battingPositionScore(players);

  return {
    wicketKeeper,
    balance,
    positions,
    battingOrder,
    total: wicketKeeper + balance + positions,
  };
};

const bowlingScore = (players) => {
  const totalOvers = totalOversScore(players);
  const paceOvers = paceOversScore(players);
  const spinOvers = spinOversScore(players);
  const { score: powerplay, assigned: powerplayAssigned } = powerplayBowlingScore(players);
  const { score: middle,    assigned: middleAssigned    } = middleBowlingScore(players);
  const { score: death,     assigned: deathAssigned     } = deathBowlingScore(players);

  return {
    totalOvers,
    paceOvers,
    spinOvers,
    powerplay,
    middle,
    death,
    total: totalOvers + paceOvers + spinOvers + powerplay + middle + death,
    phaseAssignments: {
      powerplay: powerplayAssigned,
      middle:    middleAssigned,
      death:     deathAssigned,
    },
  };
};

const scoreBreakdown = (players) => {
  const batting = battingScore(players);
  const bowling = bowlingScore(players);
  const fitness = fitnessScore(players);
  const impact = impactScore(players);
  const tactical = tacticalScore(players);
  const age = ageScore(players);
  const captaincyScore = captaincy(players);
  const finalRaw = batting.total + bowling.total + fitness + impact + tactical + age + captaincyScore;

  return {
    batting: {
      wicketKeeper: round(batting.wicketKeeper),
      leftRightBalance: round(batting.balance),
      positions: round(batting.positions),
      total: round(batting.total),
      battingOrder: batting.battingOrder,
    },
    bowling: {
      totalOvers: round(bowling.totalOvers),
      paceOvers: round(bowling.paceOvers),
      spinOvers: round(bowling.spinOvers),
      powerplay: round(bowling.powerplay),
      middle: round(bowling.middle),
      death: round(bowling.death),
      total: round(bowling.total),
      phaseAssignments: bowling.phaseAssignments,
    },
    fitness: round(fitness),
    impact: round(impact),
    tactical: round(tactical),
    age: round(age),
    captaincy: round(captaincyScore),
    final: round(finalRaw),
    rawFinal: finalRaw,  // full precision for hill-climbing comparisons
  };
};

// Squad-mode scoring: same batting/bowling, but fitness=2pts, impact=3pts,
// no tactical (0), plus benchStrength=10pts.
// playing12: the selected 12 player objects
// fullSquad: ALL players belonging to the team (including bench)
const scoreBreakdownSquad = (playing12, fullSquad) => {
  const batting = battingScore(playing12);
  const bowling = bowlingScore(playing12);

  // Reduced multipliers: fitness max=2 (×0.2), impact max=3 (×0.3)
  const fitnessRaw = average(playing12.map(playerFitnessComposite)) * 0.2;
  const impactRaw  = average(playing12.map(playerImpactComposite)) * 0.3;
  const age        = ageScore(playing12);
  const captaincyScore = captaincy(playing12);

  // Bench = full squad minus the playing 12
  const p12Ids = new Set(playing12.map((p) => String(p._id)));
  const bench  = fullSquad.filter((p) => !p12Ids.has(String(p._id)));

  const bench_strength = benchStrengthScore(playing12, bench);

  const finalRaw =
    batting.total + bowling.total + fitnessRaw + impactRaw + age + captaincyScore + bench_strength.score;

  return {
    batting: {
      wicketKeeper: round(batting.wicketKeeper),
      leftRightBalance: round(batting.balance),
      positions: round(batting.positions),
      total: round(batting.total),
      battingOrder: batting.battingOrder,
    },
    bowling: {
      totalOvers: round(bowling.totalOvers),
      paceOvers: round(bowling.paceOvers),
      spinOvers: round(bowling.spinOvers),
      powerplay: round(bowling.powerplay),
      middle: round(bowling.middle),
      death: round(bowling.death),
      total: round(bowling.total),
      phaseAssignments: bowling.phaseAssignments,
    },
    fitness: round(fitnessRaw),
    impact: round(impactRaw),
    tactical: 0,     // not used in squad mode
    age: round(age),
    captaincy: round(captaincyScore),
    benchStrength: {
      score: bench_strength.score,
      backed: bench_strength.backed,
      total: bench_strength.total,
      details: bench_strength.details,
    },
    final: round(finalRaw),
    rawFinal: finalRaw,
  };
};

// ── Fast greedy batting order (O(n log n), no DFS) ───────────────────────────
// Used by scoreBreakdownFast during hill-climbing to avoid the expensive DFS.
const battingPositionScoreFast = (players) => {
  // Separate by role constraints (mirrors the DFS hard constraints)
  const topOrder = players.filter((p) => p.role !== 'Bowler');
  const tailOrder = players.filter((p) => p.role === 'Bowler');

  // Sort by batting composite descending
  topOrder.sort((a, b) => battingComposite(b) - battingComposite(a));
  tailOrder.sort((a, b) => battingComposite(b) - battingComposite(a));

  const ordered = [...topOrder, ...tailOrder].slice(0, 12);
  let positionFitScore = 0;

  ordered.forEach((p, idx) => {
    const position = idx + 1;
    const slotMax = POSITION_SLOT_MAX[position] ?? 0;
    const preferred = p.tactical?.positions ?? [];
    const weights = battingFormulaForPosition(position);
    const base = weightedNormalizedScore(getBattingMetrics(p), weights);
    const slotScore = preferred.includes(position) ? base : base - 3;
    positionFitScore += Math.max(0, slotScore / 10) * slotMax;
  });

  return round(positionFitScore);
};

// Fast scoring for use during hill-climbing — same formula but greedy batting order.
// Only called as the optimizer's objective function; the final breakdown always uses the full DFS.
const scoreBreakdownFast = (players) => {
  const wk = wicketKeeperScore(players);
  const balance = battingBalanceScore(players);
  const positions = battingPositionScoreFast(players);
  const battingTotal = wk + balance + positions;
  const bowling = bowlingScore(players);
  const fitness = fitnessScore(players);
  const impact = impactScore(players);
  const tactical = tacticalScore(players);
  const age = ageScore(players);
  const cap = captaincy(players);
  return battingTotal + bowling.total + fitness + impact + tactical + age + cap;
};

// ── Per-player composite helpers (for direct player-vs-player comparison) ─────
const playerBowlingComposite = (p) => {
  const pp = p.bowling?.phases?.powerplay ?? 0;
  const mid = p.bowling?.phases?.middle ?? 0;
  const dth = p.bowling?.phases?.death ?? 0;
  return pp + mid + dth;
};

const playerBattingCompositeFn = (p) => battingComposite(p);

const playerOverallComposite = (p) => {
  return battingComposite(p) + playerBowlingComposite(p) +
    (p.role_impact?.match_winner ?? 0) +
    (p.role_impact?.clutch ?? 0) +
    (p.role_impact?.consistency ?? 0);
};

module.exports = {
  scoreBreakdown,
  scoreBreakdownFast,
  scoreBreakdownSquad,
  playerBowlingComposite,
  playerBattingComposite: playerBattingCompositeFn,
  playerOverallComposite,
};
