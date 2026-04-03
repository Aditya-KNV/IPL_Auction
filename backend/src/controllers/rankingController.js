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

const buildSummary = (entry) => {
  const strongest = topMetric(entry);
  return `${entry.teamShortName} lead with ${entry.score}/100, driven most by ${strongest.label} (${strongest.value}).`;
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

        return {
          teamId: team._id,
          teamName: team.name,
          teamShortName: team.shortName,
          score: breakdown.final,
          breakdown,
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
