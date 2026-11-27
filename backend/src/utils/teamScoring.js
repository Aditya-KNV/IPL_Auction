const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, decimals = 2) => Number(value.toFixed(decimals));
const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

// ── Batting groups (34 pts) ───────────────────────────────────────────────────
// Non-bowlers are placed in three groups of up to 3: top order, middle order and
// finishers. Each player counts in at most one group, and the groups are filled
// together so that the total batting points are as high as possible.
const BATTING_GROUPS = [
  {
    key: 'top', positions: [1, 2, 3], max: 14,
    rating: (b) => 0.7 * (b?.phases?.powerplay?.rating ?? 0) + 0.3 * (b?.skills?.pace_play ?? 0),
  },
  {
    key: 'middle', positions: [4, 5, 6], max: 12,
    rating: (b) => 0.7 * (b?.phases?.middle?.rating ?? 0) + 0.3 * (b?.skills?.spin_play ?? 0),
  },
  {
    key: 'finisher', positions: [7, 8, 9], max: 8,
    rating: (b) => 0.6 * (b?.phases?.death?.rating ?? 0)
      + 0.2 * (b?.skills?.finishing ?? 0)
      + 0.2 * (b?.skills?.power_hitting ?? 0),
  },
];
const GROUP_SIZE = 3;
const OUT_OF_GROUP_PENALTY = 2;

// DP state = places available per group, encoded as top + 4*middle + 16*finisher.
const BATTING_STATES = 64;
const FULL_STATE = BATTING_STATES - 1;

const prefersGroup = (player, group) =>
  (player.tactical?.positions ?? []).some((position) => group.positions.includes(position));

// Rating (0–10) of a player in a group, after the preferred-position penalty.
const battingGroupRating = (player, group) => {
  const hasPreference = (player.tactical?.positions?.length ?? 0) > 0;
  const penalty = hasPreference && !prefersGroup(player, group) ? OUT_OF_GROUP_PENALTY : 0;
  return Math.max(0, group.rating(player.batting) - penalty);
};

// Points a player adds in each of the three groups. Bowlers add none.
const battingGroupPoints = (player) => BATTING_GROUPS.map((group) => (
  player.role === 'Bowler' ? 0 : (battingGroupRating(player, group) / 10) * (group.max / GROUP_SIZE)
));

// Adds one batter to the DP. best[state] is the highest points using at most the
// places in `state`. States are visited from high to low, so every value read has
// not yet been updated for this batter and nobody is counted twice.
// `choice` (optional) records the group picked, for reconstructing the line-up.
const addBatter = (best, points, offset, choice = null, choiceOffset = 0) => {
  const top = points[offset];
  const middle = points[offset + 1];
  const finisher = points[offset + 2];
  for (let state = FULL_STATE; state > 0; state -= 1) {
    let value = best[state];
    let picked = 0;
    if ((state & 3) !== 0 && best[state - 1] + top > value) { value = best[state - 1] + top; picked = 1; }
    if ((state & 12) !== 0 && best[state - 4] + middle > value) { value = best[state - 4] + middle; picked = 2; }
    if ((state & 48) !== 0 && best[state - 16] + finisher > value) { value = best[state - 16] + finisher; picked = 3; }
    best[state] = value;
    if (choice) choice[choiceOffset + state] = picked;
  }
};

const keeperPoints = (keeperCount, firstKeeperInjuryRisk) => {
  if (keeperCount > 1) return 3;
  if (keeperCount === 1) return firstKeeperInjuryRisk <= 3 ? 2.5 : 2;
  return 0;
};

const wicketKeeperScore = (players) => {
  const keepers = players.filter((player) => player.role === 'Wicket-Keeper');
  return keeperPoints(keepers.length, keepers[0]?.fitness?.injury_risk ?? 10);
};

// `batters` counts non-bowlers — only they face the opposition's bowling line.
const balancePoints = (left, batters) => {
  const right = batters - left;
  if (!left || !right) return 0;
  // Normalise against the best achievable ratio for n players: floor(n/2) : ceil(n/2).
  // This means 4:5 with 9 batters and 3:4 with 7 batters both earn full marks,
  // because you cannot get closer to 50/50 with an odd group.
  const perfectRatio = Math.floor(batters / 2) / Math.ceil(batters / 2);
  if (perfectRatio === 0) return 0;
  const actualRatio = Math.min(left, right) / Math.max(left, right);
  return clamp(3 * (actualRatio / perfectRatio), 0, 3);
};

const battingBalanceScore = (players) => {
  const batters = players.filter((p) => p.role !== 'Bowler');
  const left = batters.filter((player) => player.batting_style === 'left-handed').length;
  return balancePoints(left, batters.length);
};

const battingPositionScore = (players) => {
  const n = players.length;
  const points = new Float64Array(3 * n);
  const best = new Float64Array(BATTING_STATES);
  const choice = new Uint8Array(n * BATTING_STATES);

  players.forEach((player, i) => {
    points.set(battingGroupPoints(player), 3 * i);
    if (player.role !== 'Bowler') addBatter(best, points, 3 * i, choice, i * BATTING_STATES);
  });

  // Walk the choices backwards to find who fills each group.
  const members = BATTING_GROUPS.map(() => []);
  let state = FULL_STATE;
  for (let i = n - 1; i >= 0; i -= 1) {
    const picked = choice[i * BATTING_STATES + state];
    if (picked === 0) continue;
    members[picked - 1].unshift(i);
    state -= 1 << (2 * (picked - 1));
  }

  const entry = (i, position, g) => {
    const player = players[i];
    const group = BATTING_GROUPS[g];
    return {
      playerId: String(player._id),
      name: player.name,
      position,
      group: group?.key ?? null,
      isPreferred: group ? prefersGroup(player, group) : null,
      slotScore: group ? round(battingGroupRating(player, group)) : 0,
      slotMax: group ? round(group.max / GROUP_SIZE) : 0,
      contribution: group ? round(points[3 * i + g]) : 0,
    };
  };

  const battingOrder = [];
  members.forEach((group, g) => {
    group.forEach((i, slot) => battingOrder.push(entry(i, BATTING_GROUPS[g].positions[slot], g)));
  });

  // Players outside the groups fill the remaining positions, bowlers last.
  const grouped = new Set(members.flat());
  const rest = players.map((_, i) => i).filter((i) => !grouped.has(i))
    .sort((a, b) => (players[a].role === 'Bowler') - (players[b].role === 'Bowler'));
  const taken = new Set(battingOrder.map((e) => e.position));
  for (let position = 1; position <= 12 && rest.length; position += 1) {
    if (!taken.has(position)) battingOrder.push(entry(rest.shift(), position, -1));
  }
  battingOrder.sort((a, b) => a.position - b.position);

  return { score: best[FULL_STATE], battingOrder };
};

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

const totalOversPoints = (overs) => {
  if (overs >= 24) return 3;
  if (overs === 23) return 2.5;
  if (overs === 22) return 2;
  if (overs === 21) return 1;
  if (overs === 20) return 0.5;
  return 0;
};

const totalOversScore = (players) =>
  totalOversPoints(players.reduce((sum, player) => sum + (player.tactical?.overs ?? 0), 0));

const paceOversPoints = (overs, hasBothArms) => {
  let score = 0;
  if (overs >= 14) score = 2.5;
  else if (overs === 13) score = 2;
  else if (overs === 12) score = 1.5;
  else if (overs === 11) score = 1;
  else if (overs === 10) score = 0.5;
  if (hasBothArms) score += 0.5;
  return clamp(score, 0, 3);
};

const paceOversScore = (players) => {
  const pacers = players.filter((player) => isPacer(player.bowling_style));
  const overs = pacers.reduce((sum, player) => sum + (player.tactical?.overs ?? 0), 0);
  const arms = new Set(pacers.map((player) => bowlingArm(player.bowling_style)));
  return paceOversPoints(overs, arms.has('left') && arms.has('right'));
};

// One bit per spin archetype, so a set of archetypes is a 4-bit mask:
// off-left = 1, off-right = 2, leg-left = 4, leg-right = 8.
const spinArchetypeBit = (style = '') => {
  const arm = bowlingArm(style);
  if (arm === 'unknown') return 0;
  if (spinType(style) === 'off') return arm === 'left' ? 1 : 2;
  return arm === 'left' ? 4 : 8;
};

const hasSpinCombo = (mask) => {
  const offLeft = mask & 1, offRight = mask & 2, legLeft = mask & 4, legRight = mask & 8;
  return Boolean(
    (offLeft && legRight) || (offRight && legLeft) || (offLeft && offRight) || (legLeft && legRight)
  );
};

const spinOversPoints = (overs, archetypeMask) => {
  let score = 0;
  if (overs >= 10) score = 2.5;
  else if (overs === 9) score = 2;
  else if (overs === 8) score = 1.5;
  else if (overs === 7) score = 1;
  else if (overs === 6) score = 0.5;
  if (hasSpinCombo(archetypeMask)) score += 0.5;
  return clamp(score, 0, 3);
};

const spinOversScore = (players) => {
  const spinners = players.filter((player) => isSpinner(player.bowling_style));
  const overs = spinners.reduce((sum, player) => sum + (player.tactical?.overs ?? 0), 0);
  const mask = spinners.reduce((bits, player) => bits | spinArchetypeBit(player.bowling_style), 0);
  return spinOversPoints(overs, mask);
};

// Only players who actually bowl (overs > 0) are eligible for phase scores.
// Each phase requires at least 2 eligible bowlers — a single bowler cannot
// cover the required overs alone (powerplay = 6, middle = 10, death = 4).
const eligibleBowlers = (players) => players.filter((p) => (p.tactical?.overs ?? 0) > 0);

// bowling.positions is a 3-element array: [powerplay, middle, death]
// A value of 1 means the bowler is designated for that phase.
// Bowlers not designated for the phase they are bowling in receive a -2 effective rating penalty.
// Returns { score, assigned } where assigned is the top-4 bowler list used for scoring.
// Rating used for a bowler in a phase. The -2 penalty only applies if the bowler
// has explicit phase designations set AND this phase isn't one of them. Bowlers
// with no designations at all use their raw rating — "no designation" means
// general-purpose, not "wrong phase".
const phaseRating = (player, phaseKey, positionIndex) => {
  const base = player.bowling?.phases?.[phaseKey] ?? 0;
  const hasAnyDesignation = player.bowling?.positions?.some((v) => v === 1) ?? false;
  const designated = !hasAnyDesignation || (player.bowling?.positions?.[positionIndex] ?? 0) === 1;
  return { base, designated, effective: designated ? base : base - 2 };
};

// [phase key, index in bowling.positions, multiplier, max points]
const BOWLING_PHASES = [
  ['powerplay', 0, 1.0, 10],
  ['middle', 1, 1.1, 11],
  ['death', 2, 1.0, 10],
];

// Returns { score, assigned } where assigned is the top-4 bowler list used for scoring.
const phaseBowlingScore = (players, [phaseKey, positionIndex, multiplier, maxScore]) => {
  const bowlers = eligibleBowlers(players);
  if (bowlers.length < 2) return { score: 0, assigned: [] };

  const entries = bowlers.map((p) => ({ name: p.name, ...phaseRating(p, phaseKey, positionIndex) }));

  // Take top 4 by effective rating
  const top4 = [...entries].sort((a, b) => b.effective - a.effective).slice(0, 4);
  const avg = top4.reduce((s, e) => s + e.effective, 0) / top4.length;
  const score = clamp(avg * multiplier, 0, maxScore);

  return { score, assigned: top4 };
};

const powerplayBowlingScore = (players) => phaseBowlingScore(players, BOWLING_PHASES[0]);
const middleBowlingScore    = (players) => phaseBowlingScore(players, BOWLING_PHASES[1]);
const deathBowlingScore     = (players) => phaseBowlingScore(players, BOWLING_PHASES[2]);

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
const captaincyPoints = (total) => {
  if (total <= 0) return 0;
  const steps = Math.floor(Math.max(0, 1.75 - total) / 0.25);
  return Math.max(0, 4 - steps * 0.5);
};
const captaincy = (players) =>
  captaincyPoints(players.reduce((sum, p) => sum + (p.tactical?.captaincy ?? 0), 0));
const agePoints = (averageAge) => clamp(1 - (Math.abs(averageAge - 30) / 15), 0, 1);
const ageScore = (players) => agePoints(average(players.map((player) => player.age ?? 0)));

// Players are always scored in ID order, so the same 12 gets exactly the same
// score however the array was ordered.
const byId = (players) => [...players].sort((a, b) => {
  const x = String(a._id);
  const y = String(b._id);
  if (x === y) return 0;
  return x < y ? -1 : 1;
});

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

const scoreBreakdown = (squad) => {
  const players = byId(squad);
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
const scoreBreakdownSquad = (selected, squad) => {
  const playing12 = byId(selected);
  const fullSquad = byId(squad);
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

module.exports = {
  scoreBreakdown,
  scoreBreakdownSquad,
  // Rule building blocks shared with the exhaustive search (playing12Search.js).
  BATTING_STATES,
  BOWLING_PHASES,
  addBatter,
  agePoints,
  balancePoints,
  battingGroupPoints,
  bowlingArm,
  byId,
  captaincyPoints,
  isPacer,
  isSpinner,
  isValidBackup,
  keeperPoints,
  paceOversPoints,
  phaseRating,
  playerFitnessComposite,
  playerImpactComposite,
  spinArchetypeBit,
  spinOversPoints,
  totalOversPoints,
};
