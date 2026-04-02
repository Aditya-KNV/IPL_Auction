// ── Phase scoring ─────────────────────────────────────────────────────────────

function battingScore(players) {
  let powerplay = 0, middle = 0, death = 0;
  players.forEach((p) => {
    powerplay += p.batting?.phases?.powerplay?.rating ?? 0;
    middle    += p.batting?.phases?.middle?.rating    ?? 0;
    death     += p.batting?.phases?.death?.rating     ?? 0;
  });
  return (powerplay + middle + death) / 3;
}

function bowlingScore(players) {
  let powerplay = 0, middle = 0, death = 0;
  players.forEach((p) => {
    powerplay += p.bowling?.phases?.powerplay ?? 0;
    middle    += p.bowling?.phases?.middle    ?? 0;
    death     += p.bowling?.phases?.death     ?? 0;
  });
  return (powerplay + middle + death) / 3;
}

// ── Role coverage ─────────────────────────────────────────────────────────────

function roleCoverage(players) {
  const roles = { opener: false, finisher: false, spinner: false, death_bowler: false };

  players.forEach((p) => {
    if (p.tactical?.positions?.includes(1) || p.tactical?.positions?.includes(2))
      roles.opener = true;
    if ((p.batting?.skills?.finishing ?? 0) > 8)
      roles.finisher = true;
    if ((p.bowling?.skills?.variations ?? 0) > 7)
      roles.spinner = true;
    if ((p.bowling?.phases?.death ?? 0) > 7)
      roles.death_bowler = true;
  });

  return Object.values(roles).filter(Boolean).length * 5; // max 20
}

// ── Left-right balance ────────────────────────────────────────────────────────

function balanceScore(players) {
  let left = 0, right = 0;
  players.forEach((p) => {
    if (p.batting_style === 'left-handed') left++;
    else right++;
  });
  return Math.min(left, right) * 2;
}

// ── Match winners ─────────────────────────────────────────────────────────────

function matchWinnerScore(players) {
  if (!players.length) return 0;
  const total = players.reduce((s, p) => s + (p.role_impact?.match_winner ?? 0), 0);
  return total / players.length;
}

// ── Bench strength ────────────────────────────────────────────────────────────

function benchScore(bench) {
  if (!bench.length) return 0;
  const total = bench.reduce((s, p) => {
    return s + (
      (p.batting?.phases?.middle?.rating ?? 0) +
      (p.bowling?.phases?.middle         ?? 0) +
      (p.tactical?.flexibility           ?? 0)
    );
  }, 0);
  return total / bench.length;
}

// ── Final composite score ─────────────────────────────────────────────────────

function finalScore(playing12, bench) {
  const playingScore =
    battingScore(playing12)    * 2 +
    bowlingScore(playing12)    * 2 +
    roleCoverage(playing12)        +
    balanceScore(playing12)        +
    matchWinnerScore(playing12);

  const bench_strength = benchScore(bench);

  return playingScore * 0.7 + bench_strength * 0.3;
}

// ── Summary object (for prompt / API response) ────────────────────────────────

function scoreBreakdown(playing12, bench) {
  return {
    batting:      +battingScore(playing12).toFixed(2),
    bowling:      +bowlingScore(playing12).toFixed(2),
    roleCoverage: +roleCoverage(playing12).toFixed(2),
    balance:      +balanceScore(playing12).toFixed(2),
    matchWinners: +matchWinnerScore(playing12).toFixed(2),
    benchStrength:+benchScore(bench).toFixed(2),
    final:        +finalScore(playing12, bench).toFixed(2),
  };
}

module.exports = { battingScore, bowlingScore, roleCoverage, balanceScore, matchWinnerScore, benchScore, finalScore, scoreBreakdown };
