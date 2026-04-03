import React, { useState } from 'react';
import api from '../services/api';

const MEDAL = ['🥇', '🥈', '🥉'];

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

const BreakdownRow = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
    <span className="text-gray-400">{label}</span>
    <span className="font-semibold tabular-nums text-white">{value}</span>
  </div>
);

const TeamCard = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const medal = MEDAL[entry.rank - 1] ?? `#${entry.rank}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70">
      <button className="w-full p-5 text-left" onClick={() => setExpanded((value) => !value)}>
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
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <ScoreBar score={entry.score} />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-gray-800/60 px-5 pb-5 pt-4">
          <p className="text-sm leading-relaxed text-gray-300">{entry.summary}</p>

          <div className="grid grid-cols-2 gap-2">
            <BreakdownRow label="Batting" value={entry.breakdown.batting.total} />
            <BreakdownRow label="Bowling" value={entry.breakdown.bowling.total} />
            <BreakdownRow label="Fitness" value={entry.breakdown.fitness} />
            <BreakdownRow label="Impact" value={entry.breakdown.impact} />
            <BreakdownRow label="Tactical" value={entry.breakdown.tactical} />
            <BreakdownRow label="Age" value={entry.breakdown.age} />
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ipl-gold">Batting Breakdown</p>
            <div className="grid grid-cols-1 gap-2">
              <BreakdownRow label="Wicket Keeper" value={entry.breakdown.batting.wicketKeeper} />
              <BreakdownRow label="Left/Right Balance" value={entry.breakdown.batting.leftRightBalance} />
              <BreakdownRow label="Position Fit" value={entry.breakdown.batting.positions} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ipl-gold">Bowling Breakdown</p>
            <div className="grid grid-cols-1 gap-2">
              <BreakdownRow label="Total Overs" value={entry.breakdown.bowling.totalOvers} />
              <BreakdownRow label="Pace Overs" value={entry.breakdown.bowling.paceOvers} />
              <BreakdownRow label="Spin Overs" value={entry.breakdown.bowling.spinOvers} />
              <BreakdownRow label="Powerplay" value={entry.breakdown.bowling.powerplay} />
              <BreakdownRow label="Middle" value={entry.breakdown.bowling.middle} />
              <BreakdownRow label="Death" value={entry.breakdown.bowling.death} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function RankingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      <div className="mb-6">
        <h1 className="text-3xl font-black text-ipl-gold">Team Rankings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Deterministic scoring based on squad composition and role balance
        </p>
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
