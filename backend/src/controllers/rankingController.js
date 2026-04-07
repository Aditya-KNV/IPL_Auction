const Team = require('../models/Team');
const AuctionSession = require('../models/AuctionSession');
const { scoreBreakdown } = require('../utils/teamScoring');
const { getIO } = require('../socket');
const { isUserHost } = require('../socket/roomStore');
const { computePlaying12 } = require('./auctionController');

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

  return `Batting (${b.total}/40): ${parts.join('; ')}.`;
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

  const phaseAvg = ((b.powerplay / 11) + (b.middle / 12) + (b.death / 11)) / 3;
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
    const roomCode = req.query.roomCode;
    const query = roomCode ? { roomCode } : {};
    const session = await AuctionSession.findOne(query).select('latestRankings latestVerdict');
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

exports.generateRankings = async (req, res) => {
  try {
    if (!isUserHost(req.user.id)) {
      return res.status(403).json({ message: 'Only the room host can generate rankings.' });
    }

    const teams = await Team.find()
      .populate('players')
      .populate('playing12')
      .lean();

    if (!teams.length) {
      return res.status(400).json({ message: 'No teams found to rank.' });
    }

    const rankingsPromises = teams.map(async (team) => {
        const prevPlaying12Ids = (team.playing12 || []).map((p) => String(p._id));
        const oldSquad = selectSquad({ ...team, playing12: team.playing12 });
        const oldScore = scoreBreakdown(oldSquad).final;

        const newPlaying12Ids = await computePlaying12(team._id, prevPlaying12Ids);
        
        const newPlaying12Objs = team.players.filter(p => newPlaying12Ids.some(id => String(id) === String(p._id)));
        const newSquad = selectSquad({ ...team, playing12: newPlaying12Objs });
        
        const breakdown = scoreBreakdown(newSquad);
        const newScore = breakdown.final;

        const addedIds = newPlaying12Ids.map(String).filter(id => !prevPlaying12Ids.includes(id));
        const removedIds = prevPlaying12Ids.filter(id => !newPlaying12Ids.map(String).includes(id));

        const scoreDiff = newScore - oldScore;
        let changeLog = '';
        if (addedIds.length > 0 || removedIds.length > 0) {
            let currentTempSquad = [...oldSquad];
            let currentTempScore = oldScore;
            const logSteps = [];
            
            let remainingAdded = addedIds.map(id => team.players.find(p => String(p._id) === id)).filter(Boolean);
            let remainingRemoved = removedIds.map(id => oldSquad.find(p => String(p._id) === id)).filter(Boolean);

            while (remainingAdded.length > 0 && remainingRemoved.length > 0) {
                let addIdx = remainingAdded.findIndex(p => p.role === remainingRemoved[0].role);
                if (addIdx === -1) addIdx = 0;
                
                const remPlayer = remainingRemoved.splice(0, 1)[0];
                const addPlayer = remainingAdded.splice(addIdx, 1)[0];
                
                currentTempSquad = currentTempSquad.filter(p => String(p._id) !== String(remPlayer._id));
                currentTempSquad.push(addPlayer);
                
                const nextScore = scoreBreakdown(currentTempSquad).final;
                const delta = nextScore - currentTempScore;
                const diffStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
                
                logSteps.push(`Dropped ${remPlayer.name} for ${addPlayer.name} (${diffStr})`);
                currentTempScore = nextScore;
            }
            
            for (const addPlayer of remainingAdded) {
                currentTempSquad.push(addPlayer);
                const nextScore = scoreBreakdown(currentTempSquad).final;
                const delta = nextScore - currentTempScore;
                const diffStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
                logSteps.push(`Added ${addPlayer.name} (${diffStr})`);
                currentTempScore = nextScore;
            }
            
            for (const remPlayer of remainingRemoved) {
                currentTempSquad = currentTempSquad.filter(p => String(p._id) !== String(remPlayer._id));
                const nextScore = scoreBreakdown(currentTempSquad).final;
                const delta = nextScore - currentTempScore;
                const diffStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
                logSteps.push(`Dropped ${remPlayer.name} (${diffStr})`);
                currentTempScore = nextScore;
            }
            
            const totalDiff = newScore - oldScore;
            const totalStr = totalDiff >= 0 ? `+${totalDiff.toFixed(2)}` : totalDiff.toFixed(2);
            changeLog = logSteps.join('. ') + `. Total change: ${totalStr}`;
        } else {
            changeLog = 'No changes made to squad.';
        }

        const battingOrderMap = new Map(
          (breakdown.batting.battingOrder ?? []).map((b) => [b.playerId, b])
        );
        const playing12 = newSquad
          .map((p) => {
            const bo = battingOrderMap.get(String(p._id));
            return {
              _id: p._id,
              name: p.name,
              role: p.role,
              nationality: p.nationality,
              batting_style: p.batting_style,
              bowling_style: p.bowling_style,
              age: p.age,
              battingPosition: bo?.position ?? null,
              isPreferred: bo?.isPreferred ?? null,
            };
          })
          .sort((a, b) => {
            if (a.battingPosition === null) return 1;
            if (b.battingPosition === null) return -1;
            return a.battingPosition - b.battingPosition;
          });

        return {
          teamId: team._id,
          teamName: team.name,
          teamShortName: team.shortName,
          score: breakdown.final,
          breakdown,
          playing12,
          newPlaying12Ids,
          changeLog,
          summary: buildSummary({
            teamName: team.name,
            teamShortName: team.shortName,
            score: breakdown.final,
            breakdown,
          }),
        };
      });

    const unsortedRankings = await Promise.all(rankingsPromises);

    const rankings = unsortedRankings
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        rank: index + 1,
        teamName: entry.teamName,
        teamShortName: entry.teamShortName,
        score: entry.score,
        breakdown: entry.breakdown,
        playing12: entry.playing12,
        summary: entry.summary,
        changeLog: entry.changeLog,
        teamId: entry.teamId,
        newPlaying12Ids: entry.newPlaying12Ids,
      }));

    // Remove teamId from the output being sent/saved
    const sanitizedRankings = rankings.map(({ teamId, newPlaying12Ids, ...entry }) => entry);
    const verdict = buildVerdict(rankings);

    await Promise.all([
      ...rankings.map((entry) =>
        Team.findByIdAndUpdate(entry.teamId, { 
          rating: Math.round(entry.score),
          playing12: entry.newPlaying12Ids
        })
      ),
      AuctionSession.findOneAndUpdate(req.body.roomCode ? { roomCode: req.body.roomCode } : {}, {
        latestRankings: sanitizedRankings,
        latestVerdict: verdict,
      })
    ]);

    // Broadcast to the room that generated the rankings
    try {
      const io = getIO();
      const rc = req.body.roomCode;
      if (rc) io.to(rc).emit('auction:rankings-updated');
      else io.emit('auction:rankings-updated');
    } catch (socketErr) {
      console.error('[rankingController] Socket.io not available to emit update');
    }

    res.json({
      rankings: sanitizedRankings,
      verdict,
    });

  } catch (err) {
    console.error('[rankingController generateRankings]', err.message);
    res.status(500).json({ message: err.message });
  }
};
