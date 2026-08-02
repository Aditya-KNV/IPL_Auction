import React, { useState, useMemo } from 'react';
import api from '../../services/api';
import PlayerStatsModal from '../players/PlayerStatsModal';

const ROLE_COLOR = {
  Batsman:         '#3b82f6',
  Bowler:          '#ef4444',
  'All-Rounder':   '#a855f7',
  'Wicket-Keeper': '#f59e0b',
};
const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];

const ROLE_PHASES = {
  Batsman: [
    { label: 'Powerplay', key: 'batting.phases.powerplay.rating' },
    { label: 'Middle',    key: 'batting.phases.middle.rating'    },
    { label: 'Death',     key: 'batting.phases.death.rating'     },
  ],
  Bowler: [
    { label: 'Powerplay', key: 'bowling.phases.powerplay' },
    { label: 'Middle',    key: 'bowling.phases.middle'    },
    { label: 'Death',     key: 'bowling.phases.death'     },
  ],
  'All-Rounder': [
    { label: 'Bat Powerplay',  key: 'batting.phases.powerplay.rating' },
    { label: 'Bat Middle',     key: 'batting.phases.middle.rating'    },
    { label: 'Bat Death',      key: 'batting.phases.death.rating'     },
    { label: 'Bowl Powerplay', key: 'bowling.phases.powerplay'        },
    { label: 'Bowl Middle',    key: 'bowling.phases.middle'           },
    { label: 'Bowl Death',     key: 'bowling.phases.death'            },
  ],
  'Wicket-Keeper': [
    { label: 'Powerplay', key: 'batting.phases.powerplay.rating' },
    { label: 'Middle',    key: 'batting.phases.middle.rating'    },
    { label: 'Death',     key: 'batting.phases.death.rating'     },
  ],
};

const resolvePath = (obj, path) =>
  path.split('.').reduce((cur, k) => (cur != null ? cur[k] : undefined), obj);

const isOverseas = (p) => {
  const nat = String(p?.nationality || '').trim().toLowerCase();
  return nat.length > 0 && nat !== 'indian';
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

const TeamRow = ({ team, teamId, submitted }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.08] bg-surface-2/40">
    {team ? (
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
        style={{ backgroundColor: team.color || '#374151' }}
      >
        {team.shortName?.slice(0, 2) ?? '??'}
      </div>
    ) : (
      <div className="w-7 h-7 rounded-lg bg-surface-2 flex-shrink-0" />
    )}
    <span className="flex-1 text-sm text-white/80 truncate">{team?.name ?? teamId}</span>
    {submitted ? (
      <span className="text-xs font-bold text-neon flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Done
      </span>
    ) : (
      <span className="text-xs text-white/30 flex items-center gap-1">
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
  const [selected,    setSelected]    = useState(new Set());
  const [localDone,   setLocalDone]   = useState(false);
  const [search,      setSearch]      = useState('');
  const [roleFilter,  setRoleFilter]  = useState('All');
  const [phase,       setPhase]       = useState('');
  const [minRating,   setMinRating]   = useState('');
  const [statsPlayer, setStatsPlayer] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const teamById = useMemo(() => {
    const m = {};
    for (const t of allTeams) m[String(t._id)] = t;
    return m;
  }, [allTeams]);

  const serverConfirmedMe = myTeamId
    ? submittedTeamIds.map(String).includes(String(myTeamId))
    : false;
  const myDone = localDone || serverConfirmedMe;

  const showSelection = !!myTeamId && !myDone;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (maxPicks > 0 && next.size >= maxPicks) return prev;
      next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit([...selected]);
    setLocalDone(true);
  };

  const openStats = async (e, id) => {
    e.stopPropagation();
    setLoadingStats(true);
    try {
      const { data } = await api.get(`/players/${id}`);
      setStatsPlayer(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const phaseOptions = roleFilter !== 'All' ? (ROLE_PHASES[roleFilter] || []) : [];

  const handleRoleChange = (r) => {
    setRoleFilter(r);
    setPhase('');
    setMinRating('');
  };

  const filteredPlayers = useMemo(() => {
    let result = players.filter((p) => {
      if (roleFilter !== 'All' && p.role !== roleFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    if (phase && minRating !== '') {
      const min = Number(minRating);
      if (Number.isFinite(min)) {
        const phaseObj = phaseOptions.find((po) => po.key === phase);
        if (phaseObj) {
          result = result.filter((p) => {
            const val = resolvePath(p, phaseObj.key);
            return typeof val === 'number' && val >= min;
          });
        }
      }
    }

    return result;
  }, [players, roleFilter, search, phase, minRating, phaseOptions]);

  const byRole = useMemo(() => filteredPlayers.reduce((acc, p) => {
    const key = p.role || 'Other';
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {}), [filteredPlayers]);

  const orderedRoles = [
    ...ROLE_ORDER.filter((r) => byRole[r]?.length),
    ...Object.keys(byRole).filter((r) => !ROLE_ORDER.includes(r) && byRole[r]?.length),
  ];

  const hasFilters = roleFilter !== 'All' || search || phase;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-surface border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
            <div>
              <p className="text-white font-bold text-base tracking-wide flex items-center gap-2">
                <span className="text-gold-bright">⚡</span> Accelerated Auction
              </p>
              <p className="text-white/30 text-xs mt-0.5">
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
                className="text-white/30 hover:text-bid-red transition text-xs border border-white/[0.08] hover:border-bid-red/40 px-3 py-1.5 rounded-lg"
              >
                Cancel
              </button>
            )}
          </div>

          {showSelection ? (
            /* ── SELECTION VIEW ── */
            <>
              <div className="px-5 py-3 border-b border-white/[0.06] flex-shrink-0 space-y-2">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search player…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-surface-2 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-neon/50 transition"
                />

                {/* Role pills */}
                <div className="flex gap-1.5 flex-wrap">
                  {['All', ...ROLE_ORDER].map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRoleChange(r)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${
                        roleFilter === r
                          ? 'border-neon/50 text-neon bg-neon/10'
                          : 'border-white/[0.08] text-white/30 hover:border-white/20'
                      }`}
                    >
                      {r === 'All' ? 'All' : `${r}s`}
                    </button>
                  ))}
                </div>

                {/* Phase + MinRating row */}
                {phaseOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={phase}
                      onChange={(e) => { setPhase(e.target.value); setMinRating(''); }}
                      className="bg-surface-2 border border-white/[0.08] text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-neon/50 transition"
                    >
                      <option value="">All Phases</option>
                      {phaseOptions.map((po) => (
                        <option key={po.key} value={po.key}>{po.label}</option>
                      ))}
                    </select>

                    {phase && (
                      <div className="flex items-center gap-1.5 bg-surface-2 border border-white/[0.08] rounded-lg px-3 py-1.5">
                        <span className="text-white/40 text-xs whitespace-nowrap">Min</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          value={minRating}
                          onChange={(e) => setMinRating(e.target.value)}
                          placeholder="e.g. 7"
                          className="bg-transparent text-white w-12 text-xs outline-none"
                        />
                        <span className="text-white/25 text-xs">/10</span>
                      </div>
                    )}

                    {hasFilters && (
                      <button
                        onClick={() => { handleRoleChange('All'); setSearch(''); }}
                        className="text-[11px] text-white/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 hover:border-white/20 hover:text-white transition"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Result count */}
                {(phase && minRating !== '') && (
                  <p className="text-white/20 text-[11px]">
                    {filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''} match
                    {' · '}
                    {phaseOptions.find((po) => po.key === phase)?.label} ≥ {minRating}/10
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
                {orderedRoles.length === 0 && (
                  <p className="text-white/20 text-sm text-center py-8">No players found</p>
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
                        const maxed      = !isSelected && maxPicks > 0 && selected.size >= maxPicks;
                        const phaseVal   = phase ? resolvePath(p, phase) : null;
                        return (
                          <button
                            key={id}
                            onClick={() => !maxed && toggle(id)}
                            disabled={maxed}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${
                              isSelected
                                ? 'border-neon/50 bg-neon/[0.08]'
                                : maxed
                                  ? 'border-white/[0.06] bg-surface-2/20 opacity-40 cursor-not-allowed'
                                  : 'border-white/[0.08] bg-surface-2/40 hover:border-white/20 cursor-pointer'
                            }`}
                          >
                            {/* Checkbox */}
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition ${
                              isSelected ? 'border-neon bg-neon' : 'border-white/25'
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

                            <span className="flex-1 text-sm text-white/80 truncate">
                              {p.name}
                              {isOverseas(p) && <span className="ml-1 text-sky-400 text-xs">✈</span>}
                            </span>

                            {/* Phase rating badge */}
                            {phase && typeof phaseVal === 'number' && (
                              <span className="text-[10px] font-semibold text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                {phaseVal}/10
                              </span>
                            )}

                            {p.status === 'unsold' && (
                              <span className="text-[10px] font-semibold text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                Unsold
                              </span>
                            )}

                            <span className="text-xs text-white/30 flex-shrink-0">
                              Rs {p.basePrice} Cr
                            </span>

                            {/* Info button — shows full stats */}
                            <button
                              onClick={(e) => openStats(e, id)}
                              className="flex-shrink-0 text-white/20 hover:text-neon transition p-0.5 rounded"
                              title="View full stats"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 border-t border-white/[0.06] flex-shrink-0">
                <button
                  onClick={handleSubmit}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-neon text-black hover:brightness-110 transition"
                >
                  {selected.size === 0
                    ? 'Submit — No Picks'
                    : `Confirm ${selected.size} Player${selected.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          ) : (
            /* ── PROGRESS VIEW ── */
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                {myDone && !isHost && !allSubmitted && (
                  <p className="text-white/30 text-sm text-center pb-4">
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
                    <p className="text-white/20 text-sm text-center py-6">
                      No teams are assigned to this room yet.
                    </p>
                  )}
                </div>
              </div>

              {isHost && (
                <div className="px-5 py-4 border-t border-white/[0.06] flex-shrink-0 space-y-2">
                  {!allSubmitted && (
                    <p className="text-white/20 text-xs text-center">
                      You can begin now or wait for all teams to submit.
                    </p>
                  )}
                  <button
                    onClick={onBegin}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm transition ${
                      allSubmitted
                        ? 'bg-neon text-black hover:brightness-110'
                        : 'bg-surface-2 text-white/40 border border-white/[0.08] hover:bg-white/[0.06]'
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

      {/* Stats modal — rendered after the main modal so it stacks on top */}
      {statsPlayer && (
        <PlayerStatsModal player={statsPlayer} onClose={() => setStatsPlayer(null)} />
      )}
      {loadingStats && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 pointer-events-none">
          <svg className="h-8 w-8 animate-spin text-neon" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}
    </>
  );
}
