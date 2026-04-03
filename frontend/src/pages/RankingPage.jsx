import React, { useState } from 'react';
import api from '../services/api';

const MEDAL = ['🥇', '🥈', '🥉'];

// ── Explanation helpers ───────────────────────────────────────────────────────

const explainWicketKeeper = (score) => {
  if (score === 4) return 'Two or more keepers — excellent backup if one gets injured.';
  if (score === 3.5) return 'One keeper with low injury risk — reliable but no real backup.';
  if (score >= 3) return 'One keeper — squad has no backup if they get injured.';
  return 'No wicket keeper — a critical structural gap.';
};

const explainBalance = (score) => {
  if (score >= 4.5) return 'Near-perfect left/right mix — bowlers cannot settle into a line.';
  if (score >= 3) return 'Good balance — decent variety to unsettle bowlers.';
  if (score >= 1.5) return 'Uneven split — opposition can target one side.';
  if (score > 0) return 'Heavily one-sided — easy for bowlers to plan around.';
  return 'All batters are the same hand — no balance at all.';
};

const explainPositions = (score) => {
  if (score >= 28) return 'Batters slot perfectly into their natural positions — optimal order.';
  if (score >= 20) return 'Most batters are well-placed with minor mismatches.';
  if (score >= 12) return 'Several batters are out of their preferred positions.';
  return 'Major batting order issues — many players in the wrong slots.';
};

const explainTotalOvers = (score) => {
  if (score >= 3) return '24+ overs covered — full bowling rotation available.';
  if (score >= 2.5) return '23 overs — one over short of full cover.';
  if (score >= 2) return '22 overs — a small but real bowling gap.';
  if (score >= 1) return '21 overs — noticeable shortage of bowling options.';
  if (score > 0) return '20 overs — bare minimum, no margin for error.';
  return 'Under 20 overs — not enough bowlers to complete a match legally.';
};

const explainPaceOvers = (score) => {
  if (score >= 2.8) return '14+ pace overs with both left-arm and right-arm variety (+0.5 bonus).';
  if (score >= 2.5) return '14+ pace overs — dominant pace attack.';
  if (score >= 1.5) return '12–13 pace overs — solid pace depth.';
  if (score >= 1) return '11 pace overs — limited pace options.';
  if (score > 0) return '10 pace overs — only bare pace cover.';
  return 'Under 10 pace overs — critically short on fast bowling.';
};

const explainSpinOvers = (score) => {
  if (score >= 2.8) return '10+ spin overs with a complementary bowling combination (+0.5 bonus).';
  if (score >= 2.5) return '10+ spin overs — strong spin department.';
  if (score >= 1.5) return '8–9 spin overs — decent spin cover.';
  if (score >= 1) return '7 spin overs — limited spin options.';
  if (score > 0) return '6 spin overs — minimal spin cover.';
  return 'Under 6 spin overs — very little spin in the attack.';
};

const explainPhase = (score, max, phase) => {
  const pct = score / max;
  if (pct >= 0.85) return `Elite ${phase} bowling — top bowlers dominate this phase.`;
  if (pct >= 0.65) return `Strong ${phase} — good wicket-taking and run-control ability.`;
  if (pct >= 0.45) return `Average ${phase} bowling — opponents can score here.`;
  return `Weak ${phase} — bowlers are likely to be targeted in this phase.`;
};

const explainFitness = (score) => {
  const pct = score / 5;
  if (pct >= 0.85) return 'Very fit squad — low injury risk and high stamina across the board.';
  if (pct >= 0.65) return 'Generally fit with a few players who carry injury concerns.';
  if (pct >= 0.45) return 'Mixed fitness — some players are injury-prone or low on stamina.';
  return 'High injury risk — squad availability could be a serious issue.';
};

const explainImpact = (score) => {
  const pct = score / 5;
  if (pct >= 0.85) return 'High-impact squad — packed with match winners and clutch performers.';
  if (pct >= 0.65) return 'Good impact players who can win key moments in a game.';
  if (pct >= 0.45) return 'Moderate impact — squad lacks enough consistent match-changers.';
  return 'Low impact — few players capable of shifting the momentum of a match.';
};

const explainTactical = (score) => {
  const pct = score / 3;
  if (pct >= 0.85) return 'Highly flexible squad — players can adapt across multiple roles.';
  if (pct >= 0.65) return 'Good tactical depth — most players have meaningful role versatility.';
  if (pct >= 0.45) return 'Moderate flexibility — the squad is fairly rigid in roles.';
  return 'Very inflexible — little scope to change plans mid-game.';
};

const explainAge = (score) => {
  if (score >= 0.85) return 'Ideal age balance — squad average is close to peak cricket age (30).';
  if (score >= 0.65) return 'Good age mix — mostly in prime years.';
  if (score >= 0.45) return 'Squad skews young or ageing — peaks may not align.';
  return 'Age imbalance — very young or very senior squad.';
};

// ── Schema info modal ─────────────────────────────────────────────────────────

const SCHEMA_SECTIONS = [
  {
    title: 'Batting — 43 pts',
    color: 'text-blue-400',
    rows: [
      { label: 'Wicket Keeper', max: 4, desc: '2+ keepers = 4 · 1 fit keeper = 3.5 · 1 keeper = 3 · none = 0' },
      { label: 'Left/Right Balance', max: 5, desc: '5 × (min(left, right) / max(left, right))' },
      {
        label: 'Position Fit', max: 34, desc:
          '#1–2 Openers: Powerplay 50%, Pace play 15%, Middle 10%, Anchor 5%, Spin 5%, Power hit 5%\n' +
          '#3–4 Top order: Middle 40%, Powerplay 20%, Pace 10%, Spin 10%, Anchor 5%, Power hit 5%\n' +
          '#5–6 Middle: Death 30%, Middle 20%, Pace 10%, Spin 10%, Finishing 5%, Power hit 5%\n' +
          '#7–8 Lower: Death 40%, Pace 10%, Finishing 10%, Power hit 10%\n' +
          '#9–12 Tail: Power hitting 60%, Finishing 40%\n' +
          'Out-of-position player: −3 penalty per slot',
      },
    ],
  },
  {
    title: 'Bowling — 43 pts',
    color: 'text-red-400',
    rows: [
      { label: 'Total Overs', max: 3, desc: '≥24=3 · 23=2.5 · 22=2 · 21=1 · 20=0.5 · <20=0' },
      { label: 'Pace Overs', max: 3, desc: '≥14=2.5 · 13=2 · 12=1.5 · 11=1 · 10=0.5 · <10=0 · +0.5 if left+right arm pacers' },
      { label: 'Spin Overs', max: 3, desc: '≥10=2.5 · 9=2 · 8=1.5 · 7=1 · 6=0.5 · <6=0 · +0.5 for complementary spin combo' },
      { label: 'Powerplay Bowling', max: 11, desc: 'Avg of top 4 bowlers\' powerplay rating × 1.1' },
      { label: 'Middle Overs Bowling', max: 12, desc: 'Avg of top 5 bowlers\' middle-over rating × 1.2' },
      { label: 'Death Bowling', max: 11, desc: 'Avg of top 4 bowlers\' death-over rating × 1.1' },
    ],
  },
  {
    title: 'Other — 14 pts',
    color: 'text-green-400',
    rows: [
      { label: 'Fitness', max: 5, desc: 'Avg of all players: (stamina + (10 − injury risk)) / 2 × 0.5' },
      { label: 'Impact', max: 5, desc: 'Avg of all players: (match winner + clutch + consistency) / 3 × 0.5' },
      { label: 'Tactical', max: 3, desc: 'Avg tactical flexibility across squad × 0.3' },
      { label: 'Age', max: 1, desc: '1 − |avg age − 30| / 15  (peak age = 30)' },
    ],
  },
];

const InfoModal = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
    <div
      className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black text-ipl-gold">Rating Schema</h2>
          <p className="mt-0.5 text-xs text-gray-500">How each team&apos;s score out of 100 is calculated</p>
        </div>
        <button onClick={onClose} className="ml-4 text-gray-500 hover:text-white">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-5">
        {SCHEMA_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className={`mb-2 text-sm font-bold ${section.color}`}>{section.title}</p>
            <div className="space-y-2">
              {section.rows.map((row) => (
                <div key={row.label} className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{row.label}</span>
                    <span className="text-xs text-gray-500">max {row.max}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-400">{row.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Breakdown row with explanation ────────────────────────────────────────────

const BreakdownRow = ({ label, value, max, explanation }) => (
  <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2.5 text-sm">
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold tabular-nums text-white">
        {value}{max != null ? <span className="text-gray-600">/{max}</span> : ''}
      </span>
    </div>
    {explanation && <p className="mt-1 text-xs leading-relaxed text-gray-500">{explanation}</p>}
  </div>
);

const ScoreBar = ({ score }) => (
  <div className="mt-2 flex items-center gap-2">
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-700">
      <div
        className="h-full rounded-full bg-gradient-to-r from-ipl-blue to-ipl-gold transition-all duration-700"
        style={{ width: `${score}%` }}
      />
    </div>
    <span className="w-12 text-right text-xs tabular-nums text-gray-400">{score}/100</span>
  </div>
);

const ROLE_COLOR = {
  Batsman: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  Bowler: 'text-red-400 border-red-400/30 bg-red-400/10',
  'All-Rounder': 'text-purple-400 border-purple-400/30 bg-purple-400/10',
  'Wicket-Keeper': 'text-amber-400 border-amber-400/30 bg-amber-400/10',
};

const Playing12 = ({ players }) => {
  if (!players?.length) return <p className="text-xs text-gray-500">No squad data available.</p>;
  return (
    <div className="space-y-1.5">
      {players.map((p) => (
        <div key={p._id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${p.isPreferred === false ? 'border-amber-500/30 bg-amber-500/5' : 'border-gray-800 bg-gray-950/60'}`}>
          {/* Batting position badge */}
          <div className={`w-8 flex-shrink-0 text-center text-xs font-bold tabular-nums ${p.battingPosition ? (p.isPreferred ? 'text-green-400' : 'text-amber-400') : 'text-gray-600'}`}>
            {p.battingPosition ? `#${p.battingPosition}` : '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{p.name}</p>
            <p className="truncate text-[10px] text-gray-500">
              {p.nationality} · {p.batting_style === 'left-handed' ? 'LHB' : 'RHB'}
              {p.isPreferred === false && <span className="ml-1 text-amber-400">· out of position</span>}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${ROLE_COLOR[p.role] ?? 'text-gray-400 border-gray-700 bg-gray-800'}`}>
            {p.role === 'Wicket-Keeper' ? 'WK' : p.role === 'All-Rounder' ? 'AR' : p.role === 'Batsman' ? 'BAT' : 'BWL'}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Team card ─────────────────────────────────────────────────────────────────

const TeamCard = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('scores');
  const medal = MEDAL[entry.rank - 1] ?? `#${entry.rank}`;
  const b = entry.breakdown;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
      <button className="w-full p-5 text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{medal}</span>
            <div>
              <p className="text-lg font-black text-white">{entry.teamName}</p>
              <p className="font-mono text-xs text-gray-500">{entry.teamShortName}</p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-2xl font-black tabular-nums text-ipl-gold">{entry.score}</span>
            <svg
              className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <ScoreBar score={entry.score} />
      </button>

      {expanded && (
        <div className="border-t border-gray-800/60">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {['scores', 'playing12'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                  tab === t ? 'border-b-2 border-ipl-gold text-ipl-gold' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'scores' ? 'Score Breakdown' : 'Playing 12'}
              </button>
            ))}
          </div>

          <div className="space-y-4 px-5 pb-5 pt-4">
            {tab === 'playing12' ? (
              <Playing12 players={entry.playing12} />
            ) : (
              <>
                <p className="text-sm leading-relaxed text-gray-300">{entry.summary}</p>

                {/* Top-level */}
                <div className="grid grid-cols-2 gap-2">
                  <BreakdownRow label="Batting" value={b.batting.total} max={43} />
                  <BreakdownRow label="Bowling" value={b.bowling.total} max={43} />
                  <BreakdownRow label="Fitness" value={b.fitness} max={5} explanation={explainFitness(b.fitness)} />
                  <BreakdownRow label="Impact" value={b.impact} max={5} explanation={explainImpact(b.impact)} />
                  <BreakdownRow label="Tactical" value={b.tactical} max={3} explanation={explainTactical(b.tactical)} />
                  <BreakdownRow label="Age" value={b.age} max={1} explanation={explainAge(b.age)} />
                </div>

                {/* Batting breakdown */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-400">Batting Breakdown</p>
                  <div className="space-y-2">
                    <BreakdownRow label="Wicket Keeper" value={b.batting.wicketKeeper} max={4} explanation={explainWicketKeeper(b.batting.wicketKeeper)} />
                    <BreakdownRow label="Left/Right Balance" value={b.batting.leftRightBalance} max={5} explanation={explainBalance(b.batting.leftRightBalance)} />
                    <BreakdownRow label="Position Fit" value={b.batting.positions} max={34} explanation={explainPositions(b.batting.positions)} />
                  </div>
                </div>

                {/* Bowling breakdown */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-red-400">Bowling Breakdown</p>
                  <div className="space-y-2">
                    <BreakdownRow label="Total Overs" value={b.bowling.totalOvers} max={3} explanation={explainTotalOvers(b.bowling.totalOvers)} />
                    <BreakdownRow label="Pace Overs" value={b.bowling.paceOvers} max={3} explanation={explainPaceOvers(b.bowling.paceOvers)} />
                    <BreakdownRow label="Spin Overs" value={b.bowling.spinOvers} max={3} explanation={explainSpinOvers(b.bowling.spinOvers)} />
                    <BreakdownRow label="Powerplay Bowling" value={b.bowling.powerplay} max={11} explanation={explainPhase(b.bowling.powerplay, 11, 'powerplay')} />
                    <BreakdownRow label="Middle Overs" value={b.bowling.middle} max={12} explanation={explainPhase(b.bowling.middle, 12, 'middle-overs')} />
                    <BreakdownRow label="Death Bowling" value={b.bowling.death} max={11} explanation={explainPhase(b.bowling.death, 11, 'death')} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RankingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const fetchRankings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/ranking');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to fetch rankings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-ipl-gold">Team Rankings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Deterministic scoring based on squad composition and role balance
          </p>
        </div>
        <button
          onClick={() => setShowInfo(true)}
          title="How are teams rated?"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-gray-400 transition hover:border-ipl-gold hover:text-ipl-gold"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
        </button>
      </div>

      <button
        onClick={fetchRankings}
        disabled={loading}
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-ipl-gold py-3.5 text-sm font-bold text-gray-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Calculating team scores…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {data ? 'Recalculate Rankings' : 'Create Rankings'}
          </>
        )}
      </button>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-5 rounded-2xl border border-ipl-blue/30 bg-ipl-blue/10 p-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ipl-gold">Ranking Verdict</p>
            <p className="text-sm leading-relaxed text-gray-200">{data.verdict}</p>
          </div>

          <div className="space-y-3">
            {data.rankings.map((entry) => (
              <TeamCard key={entry.teamShortName} entry={entry} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
