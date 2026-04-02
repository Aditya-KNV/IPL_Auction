const Team   = require('../models/Team');
const client = require('../utils/claudeClient');
const { scoreBreakdown } = require('../utils/teamScoring');

// ── Prompt builder ─────────────────────────────────────────────────────────────

function serializePlayers(players) {
  return players.map((p) => ({
    name:          p.name,
    role:          p.role,
    nationality:   p.nationality,
    batting_style: p.batting_style,
    age:           p.age,
    batting:       p.batting,
    bowling:       p.bowling,
    role_impact:   p.role_impact,
    fitness:       p.fitness,
    tactical:      p.tactical,
    soldPrice:     p.soldPrice ?? p.basePrice,
  }));
}

function buildPrompt(teams) {
  const teamsBlock = teams.map((t) => {
    const playing12 = t.playing12?.length ? t.playing12 : t.players.slice(0, 12);
    const bench     = t.players.filter(
      (p) => !playing12.some((x) => x._id.toString() === p._id.toString())
    );

    const scores = scoreBreakdown(playing12, bench);
    const spent  = t.purse - t.remainingPurse;

    return {
      team_name:      t.name,
      short_name:     t.shortName,
      budget_total:   t.purse,
      budget_spent:   spent,
      budget_left:    t.remainingPurse,
      computed_scores: scores,
      playing12: serializePlayers(playing12),
      bench:     serializePlayers(bench),
    };
  });

  return `You are an expert IPL analyst with deep knowledge of T20 cricket strategy.

Below is the current state of all teams after the auction. For each team you have:
- Full budget breakdown (total, spent, remaining)
- Pre-computed analytical scores: batting, bowling, role coverage, L/R balance, match winners, bench strength, and a composite final score
- Full player profiles including phase-wise batting/bowling ratings, skills, fitness, and tactical info

Teams Data (JSON):
${JSON.stringify(teamsBlock, null, 2)}

Your task:
1. Rank all ${teams.length} teams from strongest (#1) to weakest (#${teams.length}).
2. Use the computed_scores as a guide but apply your own cricket intelligence — a team's balance, depth, and value-for-money matter beyond raw numbers.
3. For each team provide:
   - A score out of 10 (can be decimal, e.g. 7.5)
   - 2–4 sentence analysis covering: batting across phases, bowling coverage, balance, match winners
   - 2–3 key strengths
   - 2–3 key weaknesses
   - Comparison to what an ideal IPL team looks like (1 sentence)
4. After rankings, write an overall "verdict" (3–5 sentences): who won the auction, who lost, and the decisive factor.

Be realistic and critical — do not give everyone high scores.

Respond ONLY with valid JSON — no markdown fences, no extra keys:
{
  "rankings": [
    {
      "rank": 1,
      "teamShortName": "...",
      "teamName": "...",
      "score": 8.5,
      "analysis": "...",
      "strengths": ["...", "..."],
      "weaknesses": ["...", "..."],
      "vs_ideal": "..."
    }
  ],
  "verdict": "..."
}`;
}

// ── Controller ─────────────────────────────────────────────────────────────────

exports.getRankings = async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('players')
      .populate('playing12')
      .lean();

    if (teams.length === 0)
      return res.status(400).json({ message: 'No teams found to rank.' });

    const prompt = buildPrompt(teams);

    const message = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 8000,
      thinking:   { type: 'adaptive' },
      messages:   [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock)
      return res.status(502).json({ message: 'Claude returned no text response.' });

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      const cleaned = textBlock.text
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      parsed = JSON.parse(cleaned);
    }

    // ── Persist rating back to each Team ─────────────────────────────────────
    await Promise.all(
      parsed.rankings.map((entry) =>
        Team.findOneAndUpdate(
          { shortName: entry.teamShortName },
          { rating: Math.round(entry.score * 10) } // store as 0-100
        )
      )
    );

    res.json({
      rankings: parsed.rankings,
      verdict:  parsed.verdict,
      model:    message.model,
      usage:    message.usage,
    });
  } catch (err) {
    console.error('[rankingController]', err.message);
    if (err.status)
      return res.status(502).json({ message: `Claude API error: ${err.message}` });
    res.status(500).json({ message: err.message });
  }
};
