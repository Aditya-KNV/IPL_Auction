import React, { useState } from 'react';
import api from '../services/api';

// ── Medal colors ──────────────────────────────────────────────────────────────
const MEDAL = ['🥇', '🥈', '🥉'];

const ScoreBar = ({ score }) => (
  <div className="flex items-center gap-2 mt-2">
    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-ipl-blue to-ipl-gold transition-all duration-700"
        style={{ width: `${score}%` }}
      />
    </div>
    <span className="text-xs text-gray-400 tabular-nums w-8 text-right">{score}/100</span>
  </div>
);

const TagList = ({ items, color }) => (
  <div className="flex flex-wrap gap-1.5 mt-1">
    {items.map((item, i) => (
      <span
        key={i}
        className={`text-xs px-2 py-0.5 rounded-full border ${color}`}
      >
        {item}
      </span>
    ))}
  </div>
);

const TeamCard = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const medal = MEDAL[entry.rank - 1] ?? `#${entry.rank}`;

  return (
    <div className="bg-gray-900/70 rounded-2xl border border-gray-800 overflow-hidden">
      <button
        className="w-full text-left p-5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{medal}</span>
            <div>
              <p className="text-lg font-black text-white">{entry.teamName}</p>
              <p className="text-xs text-gray-500 font-mono">{entry.teamShortName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-2xl font-black text-ipl-gold tabular-nums">{entry.score}</span>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <ScoreBar score={entry.score} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-800/60 pt-4 space-y-3">
          <p className="text-gray-300 text-sm leading-relaxed">{entry.analysis}</p>

          <div>
            <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1">Strengths</p>
            <TagList items={entry.strengths} color="text-green-400 bg-green-500/10 border-green-500/25" />
          </div>

          <div>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Weaknesses</p>
            <TagList items={entry.weaknesses} color="text-red-400 bg-red-500/10 border-red-500/25" />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RankingPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

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
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-black text-ipl-gold">AI Team Rankings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Powered by Claude Opus · Analyses all squads and budgets
        </p>
      </div>

      {/* Generate button */}
      <button
        onClick={fetchRankings}
        disabled={loading}
        className="w-full py-3.5 rounded-xl font-bold text-sm bg-ipl-gold text-gray-950 hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-6"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Analysing squads with Claude…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {data ? 'Re-analyse' : 'Generate Rankings'}
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Verdict */}
          <div className="bg-ipl-blue/10 border border-ipl-blue/30 rounded-2xl p-5 mb-5">
            <p className="text-xs font-bold text-ipl-gold uppercase tracking-wider mb-2">Auction Verdict</p>
            <p className="text-gray-200 text-sm leading-relaxed">{data.verdict}</p>
          </div>

          {/* Team cards */}
          <div className="space-y-3">
            {data.rankings.map((entry) => (
              <TeamCard key={entry.teamShortName} entry={entry} />
            ))}
          </div>

          {/* Usage */}
          {data.usage && (
            <p className="text-xs text-gray-700 mt-4 text-right">
              Tokens — in: {data.usage.input_tokens} · out: {data.usage.output_tokens}
            </p>
          )}
        </>
      )}
    </div>
  );
}
