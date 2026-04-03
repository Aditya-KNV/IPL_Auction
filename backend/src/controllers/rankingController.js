const Team = require('../models/Team');
const { scoreBreakdown } = require('../utils/teamScoring');

const selectSquad = (team) => {
  if (team.playing12?.length) return team.playing12;
  return team.players.slice(0, 12);
};

const topMetric = (entry) => {
  const metrics = [
    { key: 'batting', label: 'batting', value: entry.breakdown.batting.total },
    { key: 'bowling', label: 'bowling', value: entry.breakdown.bowling.total },
    { key: 'fitness', label: 'fitness', value: entry.breakdown.fitness },
    { key: 'impact', label: 'impact', value: entry.breakdown.impact },
    { key: 'tactical', label: 'tactical', value: entry.breakdown.tactical },
  ];

  return metrics.sort((a, b) => b.value - a.value)[0];
};

const explainBatting = (b) => {
  const parts = [];
  if (b.wicketKeeper === 4) parts.push('two keepers (full backup)');
  else if (b.wicketKeeper === 3.5) parts.push('one fit keeper (low injury risk)');
  else if (b.wicketKeeper === 3) parts.push('one keeper (no backup)');
  else parts.push('no wicket keeper (critical gap)');

  if (b.leftRightBalance >= 4.5) parts.push('excellent left/right batting mix');
  else if (b.leftRightBalance >= 3) parts.push('decent batting balance');
  else parts.push('uneven left/right balance');

  if (b.positions >= 25) parts.push('batters fit their preferred positions very well');
  else if (b.positions >= 15) parts.push('most batters reasonably placed in the order');
  else parts.push('several batters out of their natural position');

  return `Batting (${b.total}/43): ${parts.join('; ')}.`;
};

const explainBowling = (b) => {
  const parts = [];
  if (b.totalOvers >= 5) parts.push('full 24+ overs covered');
  else if (b.totalOvers >= 3) parts.push('22-23 overs covered');
  else if (b.totalOvers >= 1) parts.push('only 20-21 overs covered — thin bowling depth');
  else parts.push('under 20 overs — dangerous bowling gap');

  if (b.paceOvers >= 4) parts.push('strong pace attack');
  else if (b.paceOvers >= 2) parts.push('moderate pace depth');
  else parts.push('weak pace cover');

  if (b.spinOvers >= 4) parts.push('good spin variety');
  else if (b.spinOvers >= 2) parts.push('some spin cover');
  else parts.push('limited spin');

  const phaseAvg = ((b.powerplay / 9) + (b.middle / 10) + (b.death / 9)) / 3;
  if (phaseAvg >= 0.75) parts.push('elite phase bowling across powerplay, middle and death');
  else if (phaseAvg >= 0.5) parts.push('solid phase bowling');
  else parts.push('bowling phases need improvement');

  return `Bowling (${b.total}/43): ${parts.join('; ')}.`;
};

const buildSummary = (entry) => {
  const { breakdown: b } = entry;
  const strongest = topMetric(entry);
  const lines = [
    `${entry.teamShortName} score ${entry.score}/100. Strongest area: ${strongest.label} (${strongest.value}).`,
    explainBatting(b.batting),
    explainBowling(b.bowling),
    `Fitness ${b.fitness}/5 · Impact ${b.impact}/5 · Tactical ${b.tactical}/3 · Age ${b.age}/1.`,
  ];
  return lines.join(' ');
};

const buildVerdict = (rankings) => {
  if (!rankings.length) return '';
  const top = rankings[0];
  const bottom = rankings[rankings.length - 1];

  return `${top.teamName} finish first on the formula with ${top.score}/100, while ${bottom.teamName} trail on ${bottom.score}/100. The rankings are fully deterministic and based on batting structure, bowling cover, fitness, impact, tactical flexibility, and age balance.`;
};

exports.getRankings = async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('players')
      .populate('playing12')
      .lean();

    if (!teams.length) {
      return res.status(400).json({ message: 'No teams found to rank.' });
    }

    const rankings = teams
      .map((team) => {
        const squad = selectSquad(team);
        const breakdown = scoreBreakdown(squad);

        const playing12 = squad.map((p) => ({
          _id: p._id,
          name: p.name,
          role: p.role,
          nationality: p.nationality,
          batting_style: p.batting_style,
          bowling_style: p.bowling_style,
          age: p.age,
        }));

        return {
          teamId: team._id,
          teamName: team.name,
          teamShortName: team.shortName,
          score: breakdown.final,
          breakdown,
          playing12,
          summary: buildSummary({
            teamName: team.name,
            teamShortName: team.shortName,
            score: breakdown.final,
            breakdown,
          }),
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        rank: index + 1,
        teamName: entry.teamName,
        teamShortName: entry.teamShortName,
        score: entry.score,
        breakdown: entry.breakdown,
        playing12: entry.playing12,
        summary: entry.summary,
        teamId: entry.teamId,
      }));

    await Promise.all(
      rankings.map((entry) =>
        Team.findByIdAndUpdate(entry.teamId, { rating: Math.round(entry.score) })
      )
    );

    res.json({
      rankings: rankings.map(({ teamId, ...entry }) => entry),
      verdict: buildVerdict(rankings),
    });

  } catch (err) {
    console.error('[rankingController]', err.message);
    res.status(500).json({ message: err.message });
  }
};
