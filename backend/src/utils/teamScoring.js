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
    let best = -3 + dfs(slotIndex + 1, usedMask); // penalty for unfilled slot

    for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
      if (usedMask & (1 << playerIndex)) continue;

      const player = players[playerIndex];
      const preferred = player.tactical?.positions ?? [];
      const slotScore = preferred.includes(position)
        ? playerBattingScoreForPosition(player, position)
        : playerBattingScoreForPosition(player, position) - 3;

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
    let bestValue = -3 + memoGet(slotIndex + 1, usedMask); // skip value
    let bestPi = -1;

    for (let pi = 0; pi < players.length; pi += 1) {
      if (usedMask & (1 << pi)) continue;
      const player = players[pi];
      const preferred = player.tactical?.positions ?? [];
      const slotScore = preferred.includes(position)
        ? playerBattingScoreForPosition(player, position)
        : playerBattingScoreForPosition(player, position) - 3;
      const candidate = slotScore + memoGet(slotIndex + 1, usedMask | (1 << pi));
      if (candidate > bestValue) { bestValue = candidate; bestPi = pi; }
    }

    if (bestPi >= 0) {
      const player = players[bestPi];
      const preferred = player.tactical?.positions ?? [];
      assignments.push({ position, playerIndex: bestPi, isPreferred: preferred.includes(position) });
      usedMask |= (1 << bestPi);
    }
  }

  return { totalScore, assignments };
};

const wicketKeeperScore = (players) => {
  const keepers = players.filter((player) => player.role === 'Wicket-Keeper');
  if (keepers.length > 1) return 4;
  if (keepers.length === 1) {
    return (keepers[0].fitness?.injury_risk ?? 10) <= 3 ? 3.5 : 3;
  }
  return 0;
};

const battingBalanceScore = (players) => {
  const left = players.filter((player) => player.batting_style === 'left-handed').length;
  const right = players.filter((player) => player.batting_style !== 'left-handed').length;
  if (!left || !right) return 0;
  return 5 * (Math.min(left, right) / Math.max(left, right));
};

const battingComposite = (player) => {
  const m = getBattingMetrics(player);
  return Object.values(m).reduce((sum, v) => sum + v, 0);
};

const battingPositionScore = (players) => {
  const candidates = [...players]
    .sort((a, b) => battingComposite(b) - battingComposite(a))
    .slice(0, 15);
  const { totalScore, assignments } = optimizeBattingOrder(candidates);
  const averageSlotScore = totalScore / 12;
  const score = Math.max(0, (averageSlotScore / 10) * 34);
  const battingOrder = assignments.map(({ position, playerIndex, isPreferred }) => {
    const p = candidates[playerIndex];
    return { playerId: String(p._id), name: p.name, position, isPreferred };
  }).sort((a, b) => a.position - b.position);
  return { score, battingOrder };
};

const normalizeBowlingStyle = (style = '') => style.toLowerCase().trim();
const isPacer = (style = '') => /(fast|medium)/i.test(style);
const isSpinner = (style = '') => /(spin|orthodox)/i.test(style);
const bowlingArm = (style = '') => {
  if (/left-arm|left arm/i.test(style)) return 'left';
  if (/right-arm|right arm/i.test(style)) return 'right';
  return 'unknown';
};

const spinType = (style = '') => {
  const normalized = normalizeBowlingStyle(style);
  if (/(orthodox|off-spin|off spin|mystery spin)/i.test(normalized)) return 'off';
  if (/(leg-spin|leg spin|wrist-spin|wrist spin|chinaman)/i.test(normalized)) return 'leg';
  return null;
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

const topAverage = (players, metricFn, count) => {
  const ratings = players
    .map(metricFn)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)
    .slice(0, count);
  return ratings.length ? average(ratings) : 0;
};

// Only players who actually bowl (overs > 0) are eligible for phase scores.
// Each phase requires at least 2 eligible bowlers — a single bowler cannot
// cover the required overs alone (powerplay = 6, middle = 10, death = 4).
const eligibleBowlers = (players) => players.filter((p) => (p.tactical?.overs ?? 0) > 0);

const powerplayBowlingScore = (players) => {
  const bowlers = eligibleBowlers(players);
  if (bowlers.length < 2) return 0;
  return topAverage(bowlers, (p) => p.bowling?.phases?.powerplay ?? 0, 4) * 1.1;
};

const middleBowlingScore = (players) => {
  const bowlers = eligibleBowlers(players);
  if (bowlers.length < 2) return 0;
  return topAverage(bowlers, (p) => p.bowling?.phases?.middle ?? 0, 5) * 1.2;
};

const deathBowlingScore = (players) => {
  const bowlers = eligibleBowlers(players);
  if (bowlers.length < 2) return 0;
  return topAverage(bowlers, (p) => p.bowling?.phases?.death ?? 0, 4) * 1.1;
};

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
const impactScore = (players) => average(players.map(playerImpactComposite)) * 0.5;
const tacticalScore = (players) => average(players.map((player) => player.tactical?.flexibility ?? 0)) * 0.3;
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
  const powerplay = powerplayBowlingScore(players);
  const middle = middleBowlingScore(players);
  const death = deathBowlingScore(players);

  return {
    totalOvers,
    paceOvers,
    spinOvers,
    powerplay,
    middle,
    death,
    total: totalOvers + paceOvers + spinOvers + powerplay + middle + death,
  };
};

const scoreBreakdown = (players) => {
  const batting = battingScore(players);
  const bowling = bowlingScore(players);
  const fitness = fitnessScore(players);
  const impact = impactScore(players);
  const tactical = tacticalScore(players);
  const age = ageScore(players);
  const final = batting.total + bowling.total + fitness + impact + tactical + age;

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
    },
    fitness: round(fitness),
    impact: round(impact),
    tactical: round(tactical),
    age: round(age),
    final: round(final),
  };
};

module.exports = {
  scoreBreakdown,
};
