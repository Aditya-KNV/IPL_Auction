import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useRoom } from '../context/RoomContext';
import { useMyTeam } from '../hooks/useMyTeam';
import PlayerStatsModal from '../components/players/PlayerStatsModal';


const MEDAL = ['🥇', '🥈', '🥉'];

// ── Explanation helpers ───────────────────────────────────────────────────────

const explainWicketKeeper = (score) => {
  if (score === 3) return 'Two or more keepers — excellent backup if one gets injured.';
  if (score === 2.5) return 'One keeper with low injury risk — reliable but no real backup.';
  if (score >= 2) return 'One keeper — squad has no backup if they get injured.';
  return 'No wicket keeper — a critical structural gap.';
};

const explainBalance = (score) => {
  if (score >= 2.7) return 'Near-perfect left/right mix — bowlers cannot settle into a line.';
  if (score >= 1.8) return 'Good balance — decent variety to unsettle bowlers.';
  if (score >= 0.9) return 'Uneven split — opposition can target one side.';
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
  const pct = score / 7;
  if (pct >= 0.85) return 'High-impact squad — packed with match winners and clutch performers.';
  if (pct >= 0.65) return 'Good impact players who can win key moments in a game.';
  if (pct >= 0.45) return 'Moderate impact — squad lacks enough consistent match-changers.';
  return 'Low impact — few players capable of shifting the momentum of a match.';
};

const explainCaptaincy = (score) => {
  if (score >= 4)   return 'Total captaincy ≥ 1.75 — excellent leadership depth across the squad.';
  if (score >= 3.5) return 'Total captaincy 1.50–1.74 — strong captain with good backup options.';
  if (score >= 3)   return 'Total captaincy 1.25–1.49 — solid captain, thin on backup.';
  if (score >= 2.5) return 'Total captaincy 1.00–1.24 — one dependable captain.';
  if (score >= 2)   return 'Total captaincy 0.75–0.99 — limited but present leadership.';
  if (score >= 1.5) return 'Total captaincy 0.50–0.74 — barely adequate leadership.';
  if (score >= 1)   return 'Total captaincy 0.25–0.49 — very thin on leadership options.';
  if (score > 0)    return 'Total captaincy < 0.25 — almost no leadership in the squad.';
  return 'No captaincy at all — critical leadership gap.';
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
    title: 'Batting — 40 pts',
    color: 'text-blue-400',
    rows: [
      { label: 'Wicket Keeper', max: 3, desc: '2+ keepers = 3 · 1 fit keeper (injury risk ≤ 3) = 2.5 · 1 keeper = 2 · none = 0' },
      { label: 'Left/Right Balance', max: 3, desc: '3 × (min(left, right) / max(left, right))' },
      {
        label: 'Position Fit', max: 34, desc:
          'Slot maxes — #1–2: 4.5 pts · #3–7: 4 pts · #8: 3 pts · #9: 1 pt · #10: 0.34 pts · #11–12: 0.33 pts\n' +
          'Each slot contribution = (fit score / 10) × slot max\n' +
          '#1–2 Openers: Powerplay 50%, Pace play 15%, Middle 10%, Anchor 5%, Spin 5%, Power hit 5%\n' +
          '#3–4 Top order: Middle 40%, Powerplay 20%, Pace 10%, Spin 10%, Anchor 5%, Power hit 5%\n' +
          '#5–6 Middle: Death 30%, Middle 20%, Pace 10%, Spin 10%, Finishing 5%, Power hit 5%\n' +
          '#7–8 Lower: Death 40%, Pace 10%, Finishing 10%, Power hit 10%\n' +
          '#9–12 Tail: Power hitting 60%, Finishing 40%\n' +
          'Out-of-position penalty: −3',
      },
    ],
  },
  {
    title: 'Bowling — 40 pts',
    color: 'text-red-400',
    rows: [
      { label: 'Total Overs', max: 3, desc: '≥24=3 · 23=2.5 · 22=2 · 21=1 · 20=0.5 · <20=0' },
      { label: 'Pace Overs', max: 3, desc: '≥14=2.5 · 13=2 · 12=1.5 · 11=1 · 10=0.5 · <10=0 · +0.5 if left+right arm pacers' },
      { label: 'Spin Overs', max: 3, desc: '≥10=2.5 · 9=2 · 8=1.5 · 7=1 · 6=0.5 · <6=0 · +0.5 for complementary spin combo' },
      { label: 'Powerplay Bowling', max: 10, desc: 'Top 4 bowlers\' effective powerplay rating × 1.0\nBowler not designated for powerplay (positions[0]≠1): −2 rating penalty' },
      { label: 'Middle Overs Bowling', max: 11, desc: 'Top 4 bowlers\' effective middle-over rating × 1.1\nBowler not designated for middle (positions[1]≠1): −2 rating penalty' },
      { label: 'Death Bowling', max: 10, desc: 'Top 4 bowlers\' effective death-over rating × 1.0\nBowler not designated for death (positions[2]≠1): −2 rating penalty' },
    ],
  },
  {
    title: 'Other — 20 pts',
    color: 'text-green-400',
    rows: [
      { label: 'Fitness', max: 5, desc: 'Avg of all players: (stamina + (10 − injury risk)) / 2 × 0.5' },
      { label: 'Impact', max: 7, desc: 'Avg of all players: (match winner + clutch + consistency) / 3 × 0.7' },
      { label: 'Tactical', max: 3, desc: 'Avg tactical flexibility across squad × 0.3' },
      { label: 'Age', max: 1, desc: '1 − |avg age − 30| / 15  (peak age = 30)' },
      { label: 'Captaincy', max: 4, desc: 'Sum of squad captaincy ratings: ≥1.75=4 · every −0.25 below 1.75 deducts 0.5 pts (min 0)' },
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

const POSITION_LABEL = (pos) => {
  if (!pos) return null;
  if (pos <= 2) return 'Opener';
  if (pos <= 4) return 'Top Order';
  if (pos <= 6) return 'Middle Order';
  if (pos <= 8) return 'Lower Order';
  return 'Tail';
};

const Playing12 = ({ players }) => {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  const openStats = async (playerId) => {
    if (loadingId) return;
    setLoadingId(playerId);
    try {
      const { data } = await api.get(`/players/${playerId}`);
      setSelectedPlayer(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  if (!players?.length) return <p className="text-xs text-gray-500">No squad data available.</p>;

  // Build a map of battingPosition -> player for quick lookup
  const byPosition = {};
  players.forEach((p) => { if (p.battingPosition) byPosition[p.battingPosition] = p; });

  return (
    <>
      {selectedPlayer && (
        <PlayerStatsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
      <div className="space-y-1.5">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((pos) => {
          const p = byPosition[pos];
          const posLabel = POSITION_LABEL(pos);

          if (!p) {
            return (
              <div
                key={pos}
                className="flex items-center gap-2 rounded-lg border border-dashed border-gray-700/40 px-2.5 py-2 opacity-40"
              >
                <div className="w-6 flex-shrink-0 text-center text-xs font-black tabular-nums text-ipl-gold">
                  {pos}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-600">— Empty —</p>
                  {posLabel && <p className="truncate text-[10px] text-gray-700">{posLabel}</p>}
                </div>
                <span className="flex-shrink-0 rounded border border-gray-800 bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold text-gray-700">
                  —
                </span>
              </div>
            );
          }

          const isLoading = loadingId === String(p._id);
          return (
            <div
              key={pos}
              onClick={() => openStats(String(p._id))}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition hover:bg-gray-800/60 ${
                p.isPreferred === false
                  ? 'border-gray-700 bg-gray-900/60'
                  : 'border-gray-800 bg-gray-950/60'
              } ${isLoading ? 'opacity-60' : ''}`}
            >
              {/* Position badge */}
              <div className="w-6 flex-shrink-0 text-center text-xs font-black tabular-nums text-ipl-gold">
                {pos}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{p.name}</p>
                <p className="truncate text-[10px] text-gray-500">
                  {p.nationality} · {p.batting_style === 'left-handed' ? 'LHB' : 'RHB'}
                  {posLabel && <span className="ml-1 text-gray-600">· {posLabel}</span>}
                  {p.isPreferred === false && <span className="ml-1 text-amber-400">· out of pos</span>}
                </p>
              </div>

              {/* Role badge */}
              <span className="flex-shrink-0 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[9px] font-bold text-gray-300">
                {p.role === 'Wicket-Keeper' ? 'WK' : p.role === 'All-Rounder' ? 'AR' : p.role === 'Batsman' ? 'BAT' : 'BWL'}
              </span>

              {isLoading && (
                <svg className="w-3 h-3 animate-spin text-ipl-gold flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </>
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
                {entry.changeLog && entry.changeLog !== 'No changes made to squad.' && (
                  <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                    <p className="font-bold text-xs uppercase tracking-wider mb-1">Recent Squad Changes</p>
                    <p>{entry.changeLog}</p>
                  </div>
                )}

                {/* Top-level */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <BreakdownRow label="Batting" value={b.batting.total} max={40} />
                  <BreakdownRow label="Bowling" value={b.bowling.total} max={40} />
                  <BreakdownRow label="Fitness" value={b.fitness} max={5} explanation={explainFitness(b.fitness)} />
                  <BreakdownRow label="Impact" value={b.impact} max={7} explanation={explainImpact(b.impact)} />
                  <BreakdownRow label="Tactical" value={b.tactical} max={3} explanation={explainTactical(b.tactical)} />
                  <BreakdownRow label="Age" value={b.age} max={1} explanation={explainAge(b.age)} />
                  <BreakdownRow label="Captaincy" value={b.captaincy} max={4} explanation={explainCaptaincy(b.captaincy)} />
                </div>

                {/* Batting breakdown */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-400">Batting Breakdown</p>
                  <div className="space-y-2">
                    <BreakdownRow label="Wicket Keeper" value={b.batting.wicketKeeper} max={3} explanation={explainWicketKeeper(b.batting.wicketKeeper)} />
                    <BreakdownRow label="Left/Right Balance" value={b.batting.leftRightBalance} max={3} explanation={explainBalance(b.batting.leftRightBalance)} />
                    <BreakdownRow label="Position Fit" value={b.batting.positions} max={34} explanation={explainPositions(b.batting.positions)} />
                  </div>

                  {/* Batting order assignment for cross-checking */}
                  {b.batting.battingOrder?.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Batting Order Assignment</p>
                      <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 space-y-1">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((pos) => {
                          const entry = b.batting.battingOrder.find((e) => e.position === pos);
                          if (!entry) return (
                            <div key={pos} className="flex items-center gap-2 text-xs opacity-30">
                              <span className="w-5 text-center font-black tabular-nums text-ipl-gold">{pos}</span>
                              <span className="text-gray-600 italic">— empty —</span>
                            </div>
                          );
                          return (
                            <div key={pos} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-center font-black tabular-nums text-ipl-gold">{pos}</span>
                                <span className="text-gray-300 font-medium">{entry.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="tabular-nums text-[10px] text-gray-500">
                                  {entry.contribution != null ? entry.contribution.toFixed(2) : '—'}
                                  <span className="text-gray-700">/{entry.slotMax != null ? entry.slotMax.toFixed(2) : '—'}</span>
                                </span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${entry.isPreferred ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                  {entry.isPreferred ? '✓' : '✗ out of pos'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        <div className="mt-1.5 flex items-center justify-between border-t border-gray-800 pt-1.5 text-[10px]">
                          <span className="text-gray-500 font-semibold uppercase tracking-wider">Total Position Fit</span>
                          <span className="tabular-nums font-black text-blue-400">
                            {b.batting.positions}<span className="text-gray-600 font-normal">/34</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bowling breakdown */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-red-400">Bowling Breakdown</p>
                  <div className="space-y-2">
                    <BreakdownRow label="Total Overs" value={b.bowling.totalOvers} max={3} explanation={explainTotalOvers(b.bowling.totalOvers)} />
                    <BreakdownRow label="Pace Overs" value={b.bowling.paceOvers} max={3} explanation={explainPaceOvers(b.bowling.paceOvers)} />
                    <BreakdownRow label="Spin Overs" value={b.bowling.spinOvers} max={3} explanation={explainSpinOvers(b.bowling.spinOvers)} />
                    <BreakdownRow label="Powerplay Bowling" value={b.bowling.powerplay} max={10} explanation={explainPhase(b.bowling.powerplay, 10, 'powerplay')} />
                    <BreakdownRow label="Middle Overs" value={b.bowling.middle} max={11} explanation={explainPhase(b.bowling.middle, 11, 'middle-overs')} />
                    <BreakdownRow label="Death Bowling" value={b.bowling.death} max={10} explanation={explainPhase(b.bowling.death, 10, 'death')} />
                  </div>

                  {/* Phase assignment breakdown for cross-checking */}
                  {b.bowling.phaseAssignments && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Phase Assignments (top 4 per phase)</p>
                      {[
                        { key: 'powerplay', label: 'Powerplay' },
                        { key: 'middle',    label: 'Middle' },
                        { key: 'death',     label: 'Death' },
                      ].map(({ key, label }) => {
                        const bowlers = b.bowling.phaseAssignments[key] ?? [];
                        if (!bowlers.length) return null;
                        return (
                          <div key={key} className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2">
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400">{label}</p>
                            <div className="space-y-1">
                              {bowlers.map((b) => (
                                <div key={b.name} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-300 font-medium">{b.name}</span>
                                  <div className="flex items-center gap-2 text-[10px]">
                                    {!b.designated && (
                                      <span className="text-amber-400">−2 penalty</span>
                                    )}
                                    <span className="tabular-nums text-gray-500">
                                      {b.base}{!b.designated && <span className="text-amber-400">→{b.effective}</span>}
                                    </span>
                                    <span className={`rounded-full px-1.5 py-0.5 font-bold ${b.designated ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                      {b.designated ? '✓' : '✗'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

// ── Report generation ─────────────────────────────────────────────────────────

function buildReportHtml(rankings, verdict, myTeamShortName, teamOwners = {}, allTeams = []) {
  const MEDAL_TEXT = ['🥇 1st', '🥈 2nd', '🥉 3rd'];

  // Put user's team first, then the rest in rank order
  const sorted = myTeamShortName
    ? [
        ...rankings.filter((r) => r.teamShortName === myTeamShortName),
        ...rankings.filter((r) => r.teamShortName !== myTeamShortName),
      ]
    : rankings;

  const bar = (val, max) => {
    const pct = Math.min(100, Math.round((val / max) * 100));
    const color =
      pct >= 75 ? '#f5c518' : pct >= 50 ? '#4a9eff' : pct >= 30 ? '#9b69ff' : '#ff6b6b';
    return `
      <div style="margin-top:4px;">
        <div style="height:6px;border-radius:3px;background:#2a2a3a;overflow:hidden;">
          <div style="width:${pct}%;height:100%;border-radius:3px;background:${color};"></div>
        </div>
      </div>`;
  };

  const row = (label, val, max) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid #1e1e2e;">
      <span style="font-size:12px;color:#aaa;">${label}</span>
      <span style="font-size:12px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;">${val}<span style="color:#555;font-weight:400">/${max}</span></span>
    </div>`;

  const teamSection = (entry) => {
    const isMyTeam = entry.teamShortName === myTeamShortName;
    const owner = teamOwners[entry.teamShortName];
    const medal = MEDAL_TEXT[entry.rank - 1] ?? `#${entry.rank}`;
    const b = entry.breakdown;

    // Compute bench: full squad minus playing 12
    const fullTeam = allTeams.find((t) => t.shortName === entry.teamShortName);
    const playing12Ids = new Set((entry.playing12 ?? []).map((p) => String(p._id)));
    const bench = (fullTeam?.players ?? []).filter((p) => !playing12Ids.has(String(p._id)));

    const ROLE_ORDER_BENCH = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
    const benchByRole = bench.reduce((acc, p) => {
      const k = p.role ?? 'Other';
      if (!acc[k]) acc[k] = [];
      acc[k].push(p);
      return acc;
    }, {});
    const benchRoles = [
      ...ROLE_ORDER_BENCH.filter((r) => benchByRole[r]?.length),
      ...Object.keys(benchByRole).filter((r) => !ROLE_ORDER_BENCH.includes(r) && benchByRole[r]?.length),
    ];

    return `
    <div style="margin-bottom:28px;border-radius:14px;overflow:hidden;border:${isMyTeam ? '2px solid #f5c518' : '1px solid #2a2a3a'};background:#12121e;page-break-inside:avoid;">
      <!-- Team header -->
      <div style="padding:18px 20px;background:${isMyTeam ? 'linear-gradient(135deg,#1a1600,#1e1a00)' : '#0e0e1a'};display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:26px;line-height:1;">${medal}</span>
          <div>
            ${isMyTeam
              ? `<div style="font-size:9px;font-weight:900;letter-spacing:2px;color:#f5c518;margin-bottom:3px;text-transform:uppercase;">★ Your Team</div>`
              : owner ? `<div style="font-size:9px;font-weight:700;letter-spacing:1px;color:#888;margin-bottom:3px;text-transform:uppercase;">${owner}</div>` : ''}
            <div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:0.3px;">${entry.teamName}</div>
            <div style="font-size:11px;color:#555;font-family:monospace;margin-top:2px;">${entry.teamShortName}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:36px;font-weight:900;color:#f5c518;font-variant-numeric:tabular-nums;line-height:1;">${entry.score}</div>
          <div style="font-size:10px;color:#555;margin-top:2px;">/ 100 pts</div>
          ${bar(entry.score, 100)}
        </div>
      </div>

      <div style="padding:18px 20px;">
        ${entry.changeLog && entry.changeLog !== 'No changes made to squad.' ? `
        <div style="border-radius:8px;border:1px solid #1a3a1a;background:#0f2a0f;padding:10px 14px;margin-bottom:18px;">
          <p style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#4caf50;text-transform:uppercase;margin:0 0 4px;">Recent Squad Changes</p>
          <p style="font-size:12px;color:#81c784;margin:0;">${entry.changeLog}</p>
        </div>` : ''}

        <!-- Score overview grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
          <div style="background:#0a0a14;border-radius:10px;padding:12px 14px;">
            <div style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#4a9eff;text-transform:uppercase;margin-bottom:8px;">Batting</div>
            ${row('Total', b.batting.total, 40)}
            ${row('Wicket Keeper', b.batting.wicketKeeper, 3)}
            ${row('L/R Balance', b.batting.leftRightBalance, 3)}
            ${row('Position Fit', b.batting.positions, 34)}
          </div>
          <div style="background:#0a0a14;border-radius:10px;padding:12px 14px;">
            <div style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#ff6b6b;text-transform:uppercase;margin-bottom:8px;">Bowling</div>
            ${row('Total', b.bowling.total, 40)}
            ${row('Total Overs', b.bowling.totalOvers, 3)}
            ${row('Pace Overs', b.bowling.paceOvers, 3)}
            ${row('Spin Overs', b.bowling.spinOvers, 3)}
            ${row('Powerplay', b.bowling.powerplay, 10)}
            ${row('Middle Overs', b.bowling.middle, 11)}
            ${row('Death', b.bowling.death, 10)}
          </div>
          <div style="background:#0a0a14;border-radius:10px;padding:12px 14px;grid-column:span 2;">
            <div style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#4caf50;text-transform:uppercase;margin-bottom:8px;">Other Metrics</div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
              ${[
                ['Fitness', b.fitness, 5],
                ['Impact', b.impact, 7],
                ['Tactical', b.tactical, 3],
                ['Age', b.age, 1],
                ['Captaincy', b.captaincy, 4],
              ]
                .map(
                  ([l, v, m]) => `
                <div style="text-align:center;">
                  <div style="font-size:10px;color:#555;margin-bottom:2px;">${l}</div>
                  <div style="font-size:16px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;">${v}<span style="font-size:10px;color:#444;font-weight:400">/${m}</span></div>
                </div>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- Batting order assignment -->
        ${b.batting.battingOrder?.length ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#4a9eff;text-transform:uppercase;margin-bottom:8px;">Batting Order Assignment</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;background:#0a0a14;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:#0d0d1e;">
                <th style="padding:6px 10px;color:#555;font-weight:700;text-align:center;letter-spacing:1px;font-size:9px;">#</th>
                <th style="padding:6px 10px;color:#555;font-weight:700;text-align:left;letter-spacing:1px;font-size:9px;">PLAYER</th>
                <th style="padding:6px 10px;color:#555;font-weight:700;text-align:right;letter-spacing:1px;font-size:9px;">CONTRIBUTION</th>
                <th style="padding:6px 10px;color:#555;font-weight:700;text-align:right;letter-spacing:1px;font-size:9px;">SLOT MAX</th>
                <th style="padding:6px 10px;color:#555;font-weight:700;text-align:center;letter-spacing:1px;font-size:9px;">FIT</th>
              </tr>
            </thead>
            <tbody>
              ${Array.from({ length: 12 }, (_, i) => i + 1).map((pos) => {
                const e = b.batting.battingOrder.find((x) => x.position === pos);
                if (!e) return `<tr style="border-top:1px solid #1a1a2e;">
                  <td style="padding:5px 10px;color:#f5c518;font-weight:700;text-align:center;">${pos}</td>
                  <td style="padding:5px 10px;color:#333;font-style:italic;" colspan="4">— empty —</td>
                </tr>`;
                return `<tr style="border-top:1px solid #1a1a2e;">
                  <td style="padding:5px 10px;color:#f5c518;font-weight:700;text-align:center;">${pos}</td>
                  <td style="padding:5px 10px;color:#ddd;font-weight:600;">${e.name}</td>
                  <td style="padding:5px 10px;color:#aaa;text-align:right;font-variant-numeric:tabular-nums;">${e.contribution != null ? e.contribution.toFixed(2) : '—'}</td>
                  <td style="padding:5px 10px;color:#555;text-align:right;font-variant-numeric:tabular-nums;">${e.slotMax != null ? e.slotMax.toFixed(2) : '—'}</td>
                  <td style="padding:5px 10px;text-align:center;">
                    <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;${e.isPreferred ? 'background:#0a2a0a;color:#4caf50;' : 'background:#2a1a00;color:#f5a623;'}">
                      ${e.isPreferred ? '✓ In pos' : '✗ Out of pos'}
                    </span>
                  </td>
                </tr>`;
              }).join('')}
              <tr style="border-top:2px solid #2a2a3a;">
                <td colspan="2" style="padding:6px 10px;font-size:9px;font-weight:900;color:#888;letter-spacing:1px;text-transform:uppercase;">Total Position Fit</td>
                <td colspan="3" style="padding:6px 10px;text-align:right;font-weight:900;color:#4a9eff;font-size:13px;font-variant-numeric:tabular-nums;">${b.batting.positions}<span style="font-size:10px;color:#444;font-weight:400">/34</span></td>
              </tr>
            </tbody>
          </table>
        </div>` : ''}

        <!-- Bowling phase assignments -->
        ${b.bowling.phaseAssignments ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#ff6b6b;text-transform:uppercase;margin-bottom:8px;">Bowling Phase Assignments (Top 4)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            ${[
              { key: 'powerplay', label: 'Powerplay', score: b.bowling.powerplay, max: 10 },
              { key: 'middle',    label: 'Middle',    score: b.bowling.middle,    max: 11 },
              { key: 'death',     label: 'Death',     score: b.bowling.death,     max: 10 },
            ].map(({ key, label, score, max }) => {
              const bowlers = b.bowling.phaseAssignments[key] ?? [];
              return `
              <div style="background:#0a0a14;border-radius:10px;overflow:hidden;">
                <div style="padding:8px 10px;background:#0d0d1e;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:9px;font-weight:900;letter-spacing:1px;color:#ff6b6b;text-transform:uppercase;">${label}</span>
                  <span style="font-size:11px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;">${score}<span style="color:#444;font-weight:400;font-size:9px;">/${max}</span></span>
                </div>
                ${bowlers.length ? `
                <table style="width:100%;border-collapse:collapse;font-size:10px;">
                  <tbody>
                    ${bowlers.map((bw) => `
                    <tr style="border-top:1px solid #1a1a2e;">
                      <td style="padding:4px 8px;color:#ddd;">${bw.name}</td>
                      <td style="padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;color:#aaa;">${bw.designated ? bw.base : `<span style="color:#aaa;">${bw.base}</span><span style="color:#f5a623;">→${bw.effective}</span>`}</td>
                      <td style="padding:4px 8px;text-align:center;">
                        <span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;${bw.designated ? 'background:#0a2a0a;color:#4caf50;' : 'background:#2a1a00;color:#f5a623;'}">
                          ${bw.designated ? '✓' : '−2'}
                        </span>
                      </td>
                    </tr>`).join('')}
                  </tbody>
                </table>` : `<p style="padding:8px;font-size:10px;color:#333;text-align:center;">No bowlers</p>`}
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        <!-- Bench / remaining players -->
        ${bench.length ? `
        <div style="margin-top:4px;">
          <div style="font-size:9px;font-weight:900;letter-spacing:1.5px;color:#888;text-transform:uppercase;margin-bottom:8px;">Remaining Players (${bench.length})</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
            ${benchRoles.map((role) => `
            <div style="background:#0a0a14;border-radius:8px;overflow:hidden;">
              <div style="padding:5px 10px;background:#0d0d1e;">
                <span style="font-size:9px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:${
                  role === 'Batsman' ? '#4a9eff' : role === 'Bowler' ? '#ff6b6b' : role === 'All-Rounder' ? '#9b69ff' : '#f5c518'
                };">${role}s (${benchByRole[role].length})</span>
              </div>
              ${benchByRole[role].map((p) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 10px;border-top:1px solid #1a1a2e;">
                <span style="font-size:11px;color:#ddd;">${p.name}</span>
                ${p.soldPrice != null ? `<span style="font-size:10px;color:#f5c518;font-variant-numeric:tabular-nums;">₹${(p.soldPrice / 10000000).toFixed(2)}Cr</span>` : ''}
              </div>`).join('')}
            </div>`).join('')}
          </div>
        </div>` : `<p style="font-size:10px;color:#333;margin-top:4px;">No remaining players — full squad in playing 12.</p>`}
      </div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>IPL Auction — Team Ratings Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#08080f;color:#fff;font-family:'Inter',sans-serif;padding:32px 24px;max-width:900px;margin:0 auto;}
    @media print{
      body{background:#fff;color:#000;padding:16px;}
      @page{margin:16mm 12mm;}
    }
  </style>
</head>
<body>
  <!-- Report header -->
  <div style="margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #f5c518;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:3px;color:#f5c518;text-transform:uppercase;margin-bottom:6px;">IPL Auction</div>
        <h1 style="font-size:32px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Team Ratings Report</h1>
        <p style="font-size:13px;color:#555;margin-top:6px;">Generated on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#555;">Scoring System</div>
        <div style="font-size:13px;color:#aaa;margin-top:2px;">Batting 40 · Bowling 40 · Other 20</div>
        <div style="font-size:11px;color:#333;margin-top:4px;">Max 100 pts</div>
      </div>
    </div>

    <!-- Verdict -->
    ${verdict ? `
    <div style="margin-top:20px;padding:14px 18px;border-radius:10px;background:#0e0e20;border:1px solid #2a2a4a;">
      <div style="font-size:9px;font-weight:900;letter-spacing:2px;color:#f5c518;text-transform:uppercase;margin-bottom:6px;">Overall Verdict</div>
      <p style="font-size:13px;color:#ccc;line-height:1.7;">${verdict}</p>
    </div>` : ''}

    <!-- Rankings summary table -->
    <div style="margin-top:20px;overflow:hidden;border-radius:10px;border:1px solid #1e1e2e;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#0a0a18;">
            <th style="padding:10px 14px;font-size:10px;color:#555;font-weight:700;text-align:left;letter-spacing:1px;">RANK</th>
            <th style="padding:10px 14px;font-size:10px;color:#555;font-weight:700;text-align:left;letter-spacing:1px;">TEAM</th>
            <th style="padding:10px 14px;font-size:10px;color:#555;font-weight:700;text-align:right;letter-spacing:1px;">SCORE</th>
            <th style="padding:10px 14px;font-size:10px;color:#555;font-weight:700;text-align:right;letter-spacing:1px;">BATTING</th>
            <th style="padding:10px 14px;font-size:10px;color:#555;font-weight:700;text-align:right;letter-spacing:1px;">BOWLING</th>
            <th style="padding:10px 14px;font-size:10px;color:#555;font-weight:700;text-align:right;letter-spacing:1px;">OTHERS</th>
          </tr>
        </thead>
        <tbody>
          ${rankings
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((e) => {
              const isMe = e.teamShortName === myTeamShortName;
              const b = e.breakdown ?? {};
              const others = ((b.fitness ?? 0) + (b.impact ?? 0) + (b.tactical ?? 0) + (b.age ?? 0) + (b.captaincy ?? 0)).toFixed(2);
              return `<tr style="border-top:1px solid #1e1e2e;background:${isMe ? '#1a1600' : 'transparent'};">
                <td style="padding:9px 14px;font-size:12px;color:#f5c518;font-weight:700;">${MEDAL_TEXT[e.rank - 1] ?? `#${e.rank}`}</td>
                <td style="padding:9px 14px;font-size:13px;color:#fff;font-weight:600;">${e.teamName}${isMe ? ' <span style="font-size:9px;font-weight:900;color:#f5c518;letter-spacing:1px;background:#f5c51822;padding:2px 6px;border-radius:4px;margin-left:6px;">YOUR TEAM</span>' : teamOwners[e.teamShortName] ? ` <span style="font-size:9px;font-weight:700;color:#aaa;letter-spacing:1px;background:#ffffff0d;padding:2px 6px;border-radius:4px;margin-left:6px;">${teamOwners[e.teamShortName]}</span>` : ''}</td>
                <td style="padding:9px 14px;font-size:14px;font-weight:900;color:#f5c518;text-align:right;font-variant-numeric:tabular-nums;">${e.score}</td>
                <td style="padding:9px 14px;font-size:12px;color:#4a9eff;text-align:right;font-variant-numeric:tabular-nums;">${e.breakdown?.batting?.total ?? '—'}/40</td>
                <td style="padding:9px 14px;font-size:12px;color:#ff6b6b;text-align:right;font-variant-numeric:tabular-nums;">${e.breakdown?.bowling?.total ?? '—'}/40</td>
                <td style="padding:9px 14px;font-size:12px;color:#4caf50;text-align:right;font-variant-numeric:tabular-nums;">${others}/20</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Per-team detailed sections -->
  <div>
    ${sorted.map(teamSection).join('')}
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1e1e2e;text-align:center;">
    <p style="font-size:10px;color:#333;letter-spacing:1px;">IPL AUCTION · TEAM RATINGS REPORT · ${new Date().getFullYear()}</p>
  </div>
</body>
</html>`;
}

export default function RankingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const { socket } = useSocket();
  const { room } = useRoom();
  const { myTeam, allTeams } = useMyTeam();
  const { teamAssignments } = useRoom();

  const fetchRankings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/ranking${room?.code ? `?roomCode=${room.code}` : ''}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to fetch rankings.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      // POST triggers a new generation on the backend, which will then emit a socket event
      const res = await api.post('/ranking', { roomCode: room?.code });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to generate rankings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRankings();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onRankingsUpdated = () => fetchRankings();
    socket.on('auction:rankings-updated', onRankingsUpdated);
    return () => {
      socket.off('auction:rankings-updated', onRankingsUpdated);
    };
  }, [socket]);

  const amHost = room?.hostId === socket?.id;
  const hasRankings = data && data.rankings?.length > 0;

  const handleDownload = () => {
    // Build shortName → username map from room team assignments
    const teamOwners = Object.values(teamAssignments ?? {}).reduce((acc, a) => {
      if (a.shortName && a.claimedBy) acc[a.shortName] = a.claimedBy;
      return acc;
    }, {});

    const html = buildReportHtml(
      data.rankings,
      data.verdict,
      myTeam?.shortName ?? null,
      teamOwners,
      allTeams
    );
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    // Small delay so the fonts/styles load before print dialog
    setTimeout(() => win.print(), 600);
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
        <div className="flex items-center gap-2">
          {hasRankings && (
            <button
              onClick={handleDownload}
              title="Download ratings report"
              className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-ipl-gold hover:text-ipl-gold"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Report
            </button>
          )}
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
      </div>

      {amHost && (
        <button
          onClick={handleGenerate}
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
              {data && data.rankings?.length ? 'Recalculate Rankings' : 'Create Rankings'}
            </>
          )}
        </button>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {data && data.rankings?.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 p-12 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-lg font-bold text-gray-400">No ratings generated yet</p>
          <p className="mt-1 text-sm text-gray-500">Wait for the auctioneer to calculate the squad scores.</p>
        </div>
      ) : data && data.rankings?.length > 0 ? (
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
      ) : null}
    </div>
  );
}
