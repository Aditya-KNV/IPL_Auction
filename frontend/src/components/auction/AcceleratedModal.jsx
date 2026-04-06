import React, { useState, useMemo } from 'react';

const ROLE_COLOR = {
  Batsman:         '#3b82f6',
  Bowler:          '#ef4444',
  'All-Rounder':   '#a855f7',
  'Wicket-Keeper': '#f59e0b',
};
const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];

const isOverseas = (p) => {
  const nat = String(p?.nationality || '').trim().toLowerCase();
  return nat.length > 0 && nat !== 'indian';
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

const TeamRow = ({ team, teamId, submitted }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-800 bg-gray-800/30">
    {team ? (
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
        style={{ backgroundColor: team.color || '#374151' }}
      >
        {team.shortName?.slice(0, 2) ?? '??'}
      </div>
    ) : (
      <div className="w-7 h-7 rounded-lg bg-gray-700 flex-shrink-0" />
    )}
    <span className="flex-1 text-sm text-gray-200 truncate">{team?.name ?? teamId}</span>
    {submitted ? (
      <span className="text-xs font-bold text-green-400 flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Done
      </span>
    ) : (
      <span className="text-xs text-gray-600 flex items-center gap-1">
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Selecting…
      </span>
    )}
  </div>
);

/* ── Main component ──────────────────────────────────────────────────────── */

/**
 * props:
 *   players          – available+unsold player list for selection
 *   maxPicks         – max players per team (host-configured)
 *   expectedTeamIds  – team IDs that must submit
 *   submittedTeamIds – team IDs that already submitted
 *   allSubmitted     – boolean
 *   myTeamId         – string | null (null = host with no team)
 *   isHost           – boolean
 *   allTeams         – array from useMyTeam for name/color lookup
 *   onSubmit(picks)  – called with array of selected playerIds (may be empty)
 *   onBegin()        – host only
 *   onCancel()       – host only
 */
export default function AcceleratedModal({
  players         = [],
  maxPicks        = 7,
  expectedTeamIds = [],
  submittedTeamIds = [],
  allSubmitted    = false,
  myTeamId        = null,
  isHost          = false,
  allTeams        = [],
  onSubmit,
  onBegin,
  onCancel,
}) {
  const [selected,   setSelected]   = useState(new Set());
  const [localDone,  setLocalDone]  = useState(false); // optimistic after submit
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const teamById = useMemo(() => {
    const m = {};
    for (const t of allTeams) m[String(t._id)] = t;
    return m;
  }, [allTeams]);

  const serverConfirmedMe = myTeamId
    ? submittedTeamIds.map(String).includes(String(myTeamId))
    : false;
  const myDone = localDone || serverConfirmedMe;

  // Show selection UI only for team owners that haven't submitted yet
  const showSelection = !!myTeamId && !myDone;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (maxPicks > 0 && next.size >= maxPicks) return prev; // cap at maxPicks (0 = no cap)
      next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit([...selected]); // empty array is valid (team picks nothing)
    setLocalDone(true);
  };

  const filteredPlayers = useMemo(() => players.filter((p) => {
    if (roleFilter !== 'All' && p.role !== roleFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [players, roleFilter, search]);

  const byRole = useMemo(() => filteredPlayers.reduce((acc, p) => {
    const key = p.role || 'Other';
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {}), [filteredPlayers]);

  const orderedRoles = [
    ...ROLE_ORDER.filter((r) => byRole[r]?.length),
    ...Object.keys(byRole).filter((r) => !ROLE_ORDER.includes(r) && byRole[r]?.length),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <p className="text-white font-bold text-base tracking-wide flex items-center gap-2">
              <span className="text-yellow-400">⚡</span> Accelerated Auction
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              {showSelection
                ? maxPicks === 0
                  ? 'No picks allowed — submit to confirm'
                  : `Pick up to ${maxPicks} players — ${selected.size}/${maxPicks} selected`
                : `${submittedTeamIds.length} / ${expectedTeamIds.length} teams submitted`}
            </p>
          </div>
          {isHost && (
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-red-400 transition text-xs border border-gray-700 hover:border-red-500/40 px-3 py-1.5 rounded-lg"
            >
              Cancel
            </button>
          )}
        </div>

        {showSelection ? (
          /* ── SELECTION VIEW (team owners who haven't submitted) ── */
          <>
            <div className="px-5 py-3 border-b border-gray-800/60 flex-shrink-0 space-y-2">
              <input
                type="text"
                placeholder="Search player…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <div className="flex gap-1.5 flex-wrap">
                {['All', ...ROLE_ORDER].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${
                      roleFilter === r
                        ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    {r === 'All' ? 'All' : `${r}s`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {orderedRoles.length === 0 && (
                <p className="text-gray-600 text-sm text-center py-8">No players found</p>
              )}
              {orderedRoles.map((role) => (
                <div key={role} className="mb-4">
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: ROLE_COLOR[role] || '#6b7280' }}
                  >
                    {role}s ({byRole[role].length})
                  </p>
                  <div className="space-y-1">
                    {byRole[role].map((p) => {
                      const id         = String(p._id);
                      const isSelected = selected.has(id);
                      const maxed      = !isSelected && selected.size >= 7;
                      return (
                        <button
                          key={id}
                          onClick={() => !maxed && toggle(id)}
                          disabled={maxed}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${
                            isSelected
                              ? 'border-yellow-500/60 bg-yellow-500/10'
                              : maxed
                                ? 'border-gray-800 bg-gray-800/30 opacity-40 cursor-not-allowed'
                                : 'border-gray-800 bg-gray-800/40 hover:border-gray-600 cursor-pointer'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition ${
                            isSelected ? 'border-yellow-400 bg-yellow-400' : 'border-gray-600'
                          }`}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>

                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: ROLE_COLOR[p.role] || '#6b7280' }}
                          />

                          <span className="flex-1 text-sm text-gray-200 truncate">
                            {p.name}
                            {isOverseas(p) && <span className="ml-1 text-sky-400 text-xs">✈</span>}
                          </span>

                          {p.status === 'unsold' && (
                            <span className="text-[10px] font-semibold text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              Unsold
                            </span>
                          )}

                          <span className="text-xs text-gray-500 flex-shrink-0">
                            Rs {p.basePrice} Cr
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-800 flex-shrink-0">
              <button
                onClick={handleSubmit}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-yellow-400 text-black hover:bg-yellow-300 transition"
              >
                {selected.size === 0
                  ? 'Submit — No Picks'
                  : `Confirm ${selected.size} Player${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        ) : (
          /* ── PROGRESS VIEW (waiting, host, or after submission) ── */
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {myDone && !isHost && !allSubmitted && (
                <p className="text-gray-500 text-sm text-center pb-4">
                  Your picks are in — waiting for other teams…
                </p>
              )}

              <div className="space-y-2">
                {expectedTeamIds.map((tid) => (
                  <TeamRow
                    key={tid}
                    teamId={tid}
                    team={teamById[tid]}
                    submitted={submittedTeamIds.map(String).includes(String(tid))}
                  />
                ))}
                {expectedTeamIds.length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-6">
                    No teams are assigned to this room yet.
                  </p>
                )}
              </div>
            </div>

            {isHost && (
              <div className="px-5 py-4 border-t border-gray-800 flex-shrink-0 space-y-2">
                {!allSubmitted && (
                  <p className="text-gray-600 text-xs text-center">
                    You can begin now or wait for all teams to submit.
                  </p>
                )}
                <button
                  onClick={onBegin}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition ${
                    allSubmitted
                      ? 'bg-green-500 text-white hover:bg-green-400'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {allSubmitted
                    ? '⚡ Begin Accelerated Auction'
                    : `Begin Now (${submittedTeamIds.length}/${expectedTeamIds.length} submitted)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
