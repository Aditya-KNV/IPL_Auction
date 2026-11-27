// Exhaustive search for the best playing 12.
//
// Every valid 12 from the squad is scored — no shortlist, random seeds, time
// limit or evaluation limit — so the result is the highest score the formula in
// teamScoring.js can give for that squad. The work is split into chunks that run
// on worker threads.
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const rules = require('./teamScoring');
const { MAX_OVERSEAS_PLAYING } = require('./teamRules');

const PLAYING_SIZE = 12;
// Chunks are made by fixing the in/out choice for this many players.
const CHUNK_PREFIX_PLAYERS = 9;
// Scores closer than this are ties. The first 12 found (lowest player IDs) wins.
const TIE_EPSILON = 1e-9;

const isOverseas = (player) => {
  const nationality = String(player.nationality || '').trim().toLowerCase();
  return nationality.length > 0 && nationality !== 'indian';
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ── Squad features ───────────────────────────────────────────────────────────
// Everything about a player that the formula needs, computed once and stored in
// typed arrays. `squad` must already be in ID order.
const compileSquad = (squad) => {
  const n = squad.length;
  const column = (fn) => Float64Array.from(squad, fn);
  const flag = (fn) => Uint8Array.from(squad, (p) => (fn(p) ? 1 : 0));

  const features = {
    n,
    overseas: flag(isOverseas),
    keeper: flag((p) => p.role === 'Wicket-Keeper'),
    batter: flag((p) => p.role !== 'Bowler'),
    leftHanded: flag((p) => p.batting_style === 'left-handed'),
    pacer: flag((p) => rules.isPacer(p.bowling_style)),
    spinner: flag((p) => rules.isSpinner(p.bowling_style)),
    paceArm: Uint8Array.from(squad, (p) => {
      const arm = rules.bowlingArm(p.bowling_style);
      if (arm === 'left') return 1;
      return arm === 'right' ? 2 : 0;
    }),
    spinBit: Uint8Array.from(squad, (p) => rules.spinArchetypeBit(p.bowling_style)),
    keeperRisk: column((p) => p.fitness?.injury_risk ?? 10),
    atRisk: flag((p) => (p.fitness?.injury_risk ?? 0) > 4),
    overs: column((p) => p.tactical?.overs ?? 0),
    captaincy: column((p) => p.tactical?.captaincy ?? 0),
    flexibility: column((p) => p.tactical?.flexibility ?? 0),
    age: column((p) => p.age ?? 0),
    fitness: column(rules.playerFitnessComposite),
    impact: column(rules.playerImpactComposite),
    battingPoints: new Float64Array(3 * n),
    phaseRatings: new Float64Array(3 * n),
    // backup[(twoKeepers * n + player) * n + candidate]
    backup: new Uint8Array(2 * n * n),
  };

  squad.forEach((player, i) => {
    features.battingPoints.set(rules.battingGroupPoints(player), 3 * i);
    rules.BOWLING_PHASES.forEach(([key, index], phase) => {
      features.phaseRatings[3 * i + phase] = rules.phaseRating(player, key, index).effective;
    });
    squad.forEach((candidate, j) => {
      features.backup[i * n + j] = rules.isValidBackup(player, candidate, 1) ? 1 : 0;
      features.backup[(n + i) * n + j] = rules.isValidBackup(player, candidate, 2) ? 1 : 0;
    });
  });

  return features;
};

// ── Fast scorer ──────────────────────────────────────────────────────────────
// Returns a function giving the same number as scoreBreakdown(...).rawFinal (or
// scoreBreakdownSquad) without allocating. `picked` holds squad indexes in
// ascending order. Keep the order of additions in step with teamScoring.js.
const createScorer = (f, mode) => {
  const squadMode = mode === 'squad';
  const best = new Float64Array(rules.BATTING_STATES);
  const selected = new Uint8Array(f.n);
  const top = new Float64Array(4);
  const phaseScore = new Float64Array(3);

  const benchPoints = (picked, size, keepers) => {
    for (let k = 0; k < size; k += 1) selected[picked[k]] = 1;
    const keeperOffset = keepers >= 2 ? f.n : 0;
    let atRisk = 0;
    let backed = 0;
    for (let k = 0; k < size; k += 1) {
      const player = picked[k];
      if (!f.atRisk[player]) continue;
      atRisk += 1;
      const row = (keeperOffset + player) * f.n;
      for (let j = 0; j < f.n; j += 1) {
        if (!selected[j] && f.backup[row + j]) { backed += 1; break; }
      }
    }
    for (let k = 0; k < size; k += 1) selected[picked[k]] = 0;
    return atRisk === 0 ? 10 : Number(((backed / atRisk) * 10).toFixed(2));
  };

  return (picked, size) => {
    let keepers = 0, keeperRisk = 10, batters = 0, left = 0;
    let overs = 0, paceOvers = 0, spinOvers = 0, arms = 0, spinMask = 0, bowlers = 0;
    let captaincy = 0, flexibility = 0, age = 0, fitness = 0, impact = 0;
    best.fill(0);

    for (let k = 0; k < size; k += 1) {
      const i = picked[k];
      if (f.keeper[i]) {
        if (keepers === 0) keeperRisk = f.keeperRisk[i];
        keepers += 1;
      }
      if (f.batter[i]) {
        batters += 1;
        left += f.leftHanded[i];
        rules.addBatter(best, f.battingPoints, 3 * i);
      }
      overs += f.overs[i];
      if (f.overs[i] > 0) bowlers += 1;
      if (f.pacer[i]) { paceOvers += f.overs[i]; arms |= f.paceArm[i]; }
      if (f.spinner[i]) { spinOvers += f.overs[i]; spinMask |= f.spinBit[i]; }
      captaincy += f.captaincy[i];
      flexibility += f.flexibility[i];
      age += f.age[i];
      fitness += f.fitness[i];
      impact += f.impact[i];
    }

    // Average of the top 4 eligible bowlers in each phase (needs at least 2).
    for (let phase = 0; phase < 3; phase += 1) {
      if (bowlers < 2) { phaseScore[phase] = 0; continue; }
      let count = 0;
      for (let k = 0; k < size; k += 1) {
        const i = picked[k];
        if (!(f.overs[i] > 0)) continue;
        const rating = f.phaseRatings[3 * i + phase];
        let slot = count < 4 ? count : 3;
        if (count >= 4 && rating <= top[3]) continue;
        while (slot > 0 && top[slot - 1] < rating) { top[slot] = top[slot - 1]; slot -= 1; }
        top[slot] = rating;
        if (count < 4) count += 1;
      }
      let sum = 0;
      for (let t = 0; t < count; t += 1) sum += top[t];
      const [, , multiplier, max] = rules.BOWLING_PHASES[phase];
      phaseScore[phase] = clamp((sum / count) * multiplier, 0, max);
    }

    const batting = rules.keeperPoints(keepers, keeperRisk)
      + rules.balancePoints(left, batters)
      + best[rules.BATTING_STATES - 1];
    const bowling = rules.totalOversPoints(overs)
      + rules.paceOversPoints(paceOvers, arms === 3)
      + rules.spinOversPoints(spinOvers, spinMask)
      + phaseScore[0] + phaseScore[1] + phaseScore[2];
    const ageValue = rules.agePoints(age / size);
    const captaincyValue = rules.captaincyPoints(captaincy);

    if (squadMode) {
      return batting + bowling + (fitness / size) * 0.2 + (impact / size) * 0.3
        + ageValue + captaincyValue + benchPoints(picked, size, keepers);
    }
    return batting + bowling + (fitness / size) * 0.5 + (impact / size) * 0.7
      + (flexibility / size) * 0.3 + ageValue + captaincyValue;
  };
};

// ── Enumeration ──────────────────────────────────────────────────────────────
// 12 players, or fewer if the squad cannot field 12 within the overseas limit.
const lineupSize = (features) => {
  const overseas = features.overseas.reduce((sum, v) => sum + v, 0);
  return Math.min(PLAYING_SIZE, features.n - overseas + Math.min(MAX_OVERSEAS_PLAYING, overseas));
};

// Splits all valid line-ups into disjoint chunks, listed in ascending ID order.
const makeChunks = (features, size) => {
  const depth = Math.min(features.n, CHUNK_PREFIX_PLAYERS);
  const chunks = [];
  const prefix = [];
  const walk = (index, overseas) => {
    if (prefix.length === size || index === depth) {
      chunks.push({ prefix: [...prefix], start: depth });
      return;
    }
    const next = overseas + features.overseas[index];
    if (next <= MAX_OVERSEAS_PLAYING) {
      prefix.push(index);
      walk(index + 1, next);
      prefix.pop();
    }
    walk(index + 1, overseas);
  };
  walk(0, 0);
  return chunks;
};

// Scores every valid line-up that starts with the chunk's prefix and takes the
// rest from squad index `start` onwards.
const searchChunk = (features, scorer, size, { prefix, start }) => {
  const picked = new Int32Array(size);
  let bestScore = -Infinity;
  let bestPicked = null;
  let evaluated = 0;
  let overseasInPrefix = 0;
  prefix.forEach((player, k) => {
    picked[k] = player;
    overseasInPrefix += features.overseas[player];
  });

  const walk = (from, count, overseas) => {
    if (count === size) {
      evaluated += 1;
      const score = scorer(picked, size);
      if (score > bestScore + TIE_EPSILON) {
        bestScore = score;
        bestPicked = Array.from(picked);
      }
      return;
    }
    const last = features.n - (size - count);
    for (let i = from; i <= last; i += 1) {
      const next = overseas + features.overseas[i];
      if (next > MAX_OVERSEAS_PLAYING) continue;
      picked[count] = i;
      walk(i + 1, count + 1, next);
    }
  };
  walk(start, prefix.length, overseasInPrefix);

  return { score: bestScore, picked: bestPicked, evaluated };
};

// ── Parallel runner ──────────────────────────────────────────────────────────
const defaultWorkerCount = () => {
  const configured = Number.parseInt(process.env.RANKING_WORKERS, 10);
  if (configured > 0) return configured;
  const cores = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, cores - 1); // leave one core for the web server
};

// Resolves only when every chunk has been searched; any worker failure rejects.
const runChunks = (features, mode, size, chunks, workerCount) => new Promise((resolve, reject) => {
  const results = new Array(chunks.length);
  const workers = [];
  let nextChunk = 0;
  let finished = 0;
  let settled = false;

  const settle = (error) => {
    if (settled) return;
    settled = true;
    workers.forEach((worker) => worker.terminate());
    if (error) reject(error);
    else resolve(results);
  };

  const dispatch = (worker) => {
    if (nextChunk >= chunks.length) return;
    const id = nextChunk;
    nextChunk += 1;
    worker.postMessage({ id, chunk: chunks[id] });
  };

  for (let w = 0; w < Math.min(workerCount, chunks.length); w += 1) {
    const worker = new Worker(path.join(__dirname, 'playing12Worker.js'), {
      workerData: { features, mode, size },
    });
    workers.push(worker);
    worker.on('message', ({ id, result }) => {
      results[id] = result;
      finished += 1;
      if (finished === chunks.length) settle();
      else dispatch(worker);
    });
    worker.on('error', settle);
    worker.on('exit', (code) => settle(new Error(`Playing-12 worker stopped early (code ${code})`)));
    dispatch(worker);
  }
});

// players : the squad to choose from
// mode    : 'playing12' or 'squad' (which scoring formula to maximise)
// Returns { playing, score, evaluated } — `playing` is in ID order.
const findBestPlaying12 = async (players, mode = 'playing12', workerCount = defaultWorkerCount()) => {
  const squad = rules.byId(players);
  const features = compileSquad(squad);
  const size = lineupSize(features);
  if (size === 0) return { playing: [], score: 0, evaluated: 0 };

  const chunks = makeChunks(features, size);
  const results = await runChunks(features, mode, size, chunks, workerCount);

  // Merge in chunk order so ties resolve the same way for any worker count.
  let best = { score: -Infinity, picked: null };
  let evaluated = 0;
  for (const result of results) {
    evaluated += result.evaluated;
    if (result.picked && result.score > best.score + TIE_EPSILON) best = result;
  }

  return { playing: best.picked.map((i) => squad[i]), score: best.score, evaluated };
};

module.exports = {
  findBestPlaying12,
  // Used by the worker thread and for verification.
  compileSquad,
  createScorer,
  searchChunk,
};
