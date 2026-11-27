const Player = require('../models/Player');
const Team = require('../models/Team');
const AuctionSession = require('../models/AuctionSession');
const { scoreBreakdown, scoreBreakdownSquad } = require('../utils/teamScoring');
const { findBestPlaying12 } = require('../utils/playing12Search');
const { getIO } = require('../socket');
const { getRawRoomByCode } = require('../socket/roomStore');

// Rooms with a ranking run in progress — a full search takes minutes and uses
// most CPU cores, so a second run must not start on top of it.
const _generating = new Set();

const round = (value, decimals = 2) => Number(Number(value).toFixed(decimals));

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
  // wicketKeeperScore returns 3 (2+ keepers), 2.5 (1 fit keeper), 2 (1 keeper), 0 (none)
  if (b.wicketKeeper >= 3) parts.push('two or more keepers (full backup)');
  else if (b.wicketKeeper >= 2.5) parts.push('one fit keeper (low injury risk)');
  else if (b.wicketKeeper >= 2) parts.push('one keeper (no backup)');
  else parts.push('no wicket keeper (critical gap)');

  // battingBalanceScore max is 3
  if (b.leftRightBalance >= 2.7) parts.push('excellent left/right batting mix');
  else if (b.leftRightBalance >= 1.5) parts.push('decent batting balance');
  else parts.push('uneven left/right balance');

  if (b.positions >= 28) parts.push('very strong top, middle and lower order');
  else if (b.positions >= 20) parts.push('batting groups reasonably well filled');
  else parts.push('batting groups are weak or short of players');

  return `Batting (${b.total}/40): ${parts.join('; ')}.`;
};

const explainBowling = (b) => {
  const parts = [];
  // totalOversScore max is 3 (24+ overs), then 2.5, 2, 1, 0.5, 0
  if (b.totalOvers >= 3) parts.push('full 24+ overs covered');
  else if (b.totalOvers >= 2) parts.push('22-23 overs covered');
  else if (b.totalOvers >= 1) parts.push('only 20-21 overs covered — thin bowling depth');
  else parts.push('under 20 overs — dangerous bowling gap');

  // paceOversScore and spinOversScore are clamped to max 3
  if (b.paceOvers >= 2.5) parts.push('strong pace attack');
  else if (b.paceOvers >= 1.5) parts.push('moderate pace depth');
  else parts.push('weak pace cover');

  if (b.spinOvers >= 2.5) parts.push('good spin variety');
  else if (b.spinOvers >= 1.5) parts.push('some spin cover');
  else parts.push('limited spin');

  const phaseAvg = ((b.powerplay / 10) + (b.middle / 11) + (b.death / 10)) / 3;
  if (phaseAvg >= 0.75) parts.push('elite phase bowling across powerplay, middle and death');
  else if (phaseAvg >= 0.5) parts.push('solid phase bowling');
  else parts.push('bowling phases need improvement');

  return `Bowling (${b.total}/40): ${parts.join('; ')}.`;
};

const buildSummary = (entry) => {
  const { breakdown: b } = entry;
  const strongest = topMetric(entry);
  const lines = [
    `${entry.teamShortName} score ${entry.score}/100. Strongest area: ${strongest.label} (${strongest.value}).`,
    explainBatting(b.batting),
    explainBowling(b.bowling),
    `Fitness ${b.fitness}/5 · Impact ${b.impact}/7 · Tactical ${b.tactical}/3 · Age ${b.age}/1.`,
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
    const roomCode = req.query.roomCode;
    const session = roomCode
      ? await AuctionSession.findOne({ roomCode }).select('latestRankings latestVerdict')
      : null;
    if (!session || !session.latestRankings) {
      return res.json({ rankings: [], verdict: 'No rankings generated yet.' });
    }
    res.json({
      rankings: session.latestRankings,
      verdict: session.latestVerdict,
    });
  } catch (err) {
    console.error('[rankingController getRankings]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// Annotate a squad's players with their optimal batting positions.
const annotateWithBattingOrder = (squad, breakdown) => {
  const boMap = new Map((breakdown.batting.battingOrder ?? []).map((b) => [b.playerId, b]));
  return squad
    .map((p) => {
      const bo = boMap.get(String(p._id));
      return {
        _id: p._id, name: p.name, role: p.role,
        nationality: p.nationality, batting_style: p.batting_style,
        bowling_style: p.bowling_style, age: p.age,
        battingPosition: bo?.position ?? null,
      };
    })
    .sort((a, b) => {
      if (a.battingPosition === null) return 1;
      if (b.battingPosition === null) return -1;
      return a.battingPosition - b.battingPosition;
    });
};

// ── Background computation — runs after HTTP response is sent ─────────────────
const _runRankings = async (roomCode, mode, sessionQuery) => {
  const teams = await Team.find({ roomCode }).populate('players').populate('playing12').lean();
  if (!teams.length) return;

  const existingSession = await AuctionSession.findOne(sessionQuery).select('latestRankings latestVerdict');
  const existingByName = new Map(
    (existingSession?.latestRankings ?? []).map((r) => [r.teamShortName, r])
  );

  const unsorted = [];
  for (const team of teams) {
    if (!team.players || team.players.length === 0) continue;

    const prevPlaying12Ids = (team.playing12 || []).map((p) => String(p._id));
    const existing = existingByName.get(team.shortName) ?? {};

    let entry;
    if (mode === 'playing12') {
      const oldSquad = selectSquad({ ...team, playing12: team.playing12 });
      const oldScore = scoreBreakdown(oldSquad).final;

      const pool = await Player.find({ roomCode, team: team._id, status: 'sold' }).lean();
      const { playing } = await findBestPlaying12(pool, 'playing12');
      const newPlaying12Ids = playing.map((p) => p._id);
      const newPlaying12Objs = team.players.filter((p) =>
        newPlaying12Ids.some((id) => String(id) === String(p._id))
      );
      const newSquad = selectSquad({ ...team, playing12: newPlaying12Objs });
      const breakdown = scoreBreakdown(newSquad);
      const newScore = breakdown.final;

      const addedIds   = newPlaying12Ids.map(String).filter((id) => !prevPlaying12Ids.includes(id));
      const removedIds = prevPlaying12Ids.filter((id) => !newPlaying12Ids.map(String).includes(id));
      let changeLog = '';
      if (addedIds.length > 0 || removedIds.length > 0) {
        let tempSquad = [...oldSquad];
        let tempScore = oldScore;
        const steps = [];
        let toAdd = addedIds.map((id) => team.players.find((p) => String(p._id) === id)).filter(Boolean);
        let toRem = removedIds.map((id) => oldSquad.find((p) => String(p._id) === id)).filter(Boolean);
        while (toAdd.length && toRem.length) {
          let ai = toAdd.findIndex((p) => p.role === toRem[0].role);
          if (ai === -1) ai = 0;
          const rem = toRem.splice(0, 1)[0];
          const add = toAdd.splice(ai, 1)[0];
          tempSquad = tempSquad.filter((p) => String(p._id) !== String(rem._id));
          tempSquad.push(add);
          const next = scoreBreakdown(tempSquad).final;
          const d = next - tempScore;
          steps.push(`Dropped ${rem.name} for ${add.name} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`);
          tempScore = next;
        }
        for (const add of toAdd) {
          tempSquad.push(add);
          const next = scoreBreakdown(tempSquad).final;
          const d = next - tempScore;
          steps.push(`Added ${add.name} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`);
          tempScore = next;
        }
        for (const rem of toRem) {
          tempSquad = tempSquad.filter((p) => String(p._id) !== String(rem._id));
          const next = scoreBreakdown(tempSquad).final;
          const d = next - tempScore;
          steps.push(`Dropped ${rem.name} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`);
          tempScore = next;
        }
        const total = newScore - oldScore;
        changeLog = steps.join('. ') + `. Total change: ${total >= 0 ? '+' : ''}${total.toFixed(2)}`;
      } else {
        changeLog = 'No changes made to squad.';
      }

      entry = {
        teamId:        team._id,
        teamName:      team.name,
        teamShortName: team.shortName,
        newPlaying12Ids,
        score:         round(newScore),
        breakdown,
        playing12:     annotateWithBattingOrder(newSquad, breakdown),
        summary:       buildSummary({ teamName: team.name, teamShortName: team.shortName, score: newScore, breakdown }),
        changeLog,
        squadScore:     existing.squadScore    ?? null,
        squadBreakdown: existing.squadBreakdown ?? null,
        squadPlaying12: existing.squadPlaying12 ?? null,
      };

    } else {
      const { playing: squadP12Objs } = await findBestPlaying12(team.players, 'squad');
      const squadBreakdown = scoreBreakdownSquad(squadP12Objs, team.players);

      entry = {
        teamId:        team._id,
        teamName:      team.name,
        teamShortName: team.shortName,
        newPlaying12Ids: null,
        squadScore:     round(squadBreakdown.final),
        squadBreakdown,
        squadPlaying12: annotateWithBattingOrder(squadP12Objs, squadBreakdown),
        score:         existing.score         ?? 0,
        breakdown:     existing.breakdown     ?? null,
        playing12:     existing.playing12     ?? null,
        summary:       existing.summary       ?? '',
        changeLog:     existing.changeLog     ?? '',
      };
    }
    unsorted.push(entry);
  }

  const rankings = unsorted
    .sort((a, b) => (b.score - a.score) || ((b.squadScore ?? 0) - (a.squadScore ?? 0)))
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  const sanitizedRankings = rankings.map(({ teamId, newPlaying12Ids, ...entry }) => entry);
  const verdict = buildVerdict(rankings);

  const saves = [
    AuctionSession.findOneAndUpdate(sessionQuery, { latestRankings: sanitizedRankings, latestVerdict: verdict }),
  ];

  if (mode === 'playing12') {
    for (const entry of rankings) {
      if (entry.newPlaying12Ids) {
        saves.push(
          Team.findByIdAndUpdate(entry.teamId, {
            rating:    Math.round(entry.score),
            playing12: entry.newPlaying12Ids,
          })
        );
      }
    }
  }

  await Promise.all(saves);

  try {
    const io = getIO();
    io.to(roomCode).emit('auction:rankings-updated');
  } catch (_) {
    console.error('[rankingController] Socket.io not available to emit update');
  }
};

exports.generateRankings = async (req, res) => {
  try {
    const roomCode = req.body.roomCode;

    const room = roomCode ? getRawRoomByCode(roomCode) : null;
    if (room?.hostUserId !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the room host can generate rankings.' });
    }

    const mode = req.body.mode === 'squad' ? 'squad' : 'playing12';
    const sessionQuery = { roomCode };

    const session = await AuctionSession.findOne(sessionQuery).select('status');
    if (session?.status !== 'completed') {
      return res.status(400).json({ message: 'Rankings are available only after the auction has ended.' });
    }

    if (_generating.has(roomCode)) {
      return res.status(409).json({ message: 'Rankings are already being generated. Please wait.' });
    }
    _generating.add(roomCode);

    // Respond immediately — computation runs in background, result pushed via socket.
    res.status(202).json({ message: 'Rankings generation started.' });

    setImmediate(() => _runRankings(roomCode, mode, sessionQuery)
      .catch((err) => {
        console.error('[rankingController _runRankings]', err.message);
        const io = getIO();
        io.to(roomCode).emit('auction:rankings-failed');
      })
      .finally(() => _generating.delete(roomCode)));

  } catch (err) {
    console.error('[rankingController generateRankings]', err.message);
    res.status(500).json({ message: err.message });
  }
};
