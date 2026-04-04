import React, { useEffect, useState, useMemo } from 'react';
import PlayerStatsModal from '../components/players/PlayerStatsModal';
import api from '../services/api';
import { STATUS_COLOR, getDisplayStatus } from '../utils/playerDisplay';

// Phase options per role
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
    { label: 'Bat Powerplay', key: 'batting.phases.powerplay.rating' },
    { label: 'Bat Middle',    key: 'batting.phases.middle.rating'    },
    { label: 'Bat Death',     key: 'batting.phases.death.rating'     },
    { label: 'Bowl Powerplay', key: 'bowling.phases.powerplay' },
    { label: 'Bowl Middle',    key: 'bowling.phases.middle'    },
    { label: 'Bowl Death',     key: 'bowling.phases.death'     },
  ],
  'Wicket-Keeper': [
    { label: 'Powerplay', key: 'batting.phases.powerplay.rating' },
    { label: 'Middle',    key: 'batting.phases.middle.rating'    },
    { label: 'Death',     key: 'batting.phases.death.rating'     },
  ],
};

// Resolve a dot-notation key from a nested object
const resolvePath = (obj, path) =>
  path.split('.').reduce((cur, k) => (cur != null ? cur[k] : undefined), obj);

const MIN_RATING = 1;
const MAX_RATING = 10;

export default function PlayersPage() {
  const [players, setPlayers]         = useState([]);
  const [role, setRole]               = useState('');
  const [status, setStatus]           = useState('');
  const [phase, setPhase]             = useState('');
  const [minRating, setMinRating]     = useState('');
  const [selected, setSelected]       = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  // When role changes, reset phase filter
  useEffect(() => { setPhase(''); setMinRating(''); }, [role]);

  // Fetch from API (role + status only — phase/rating filtered client-side)
  useEffect(() => {
    const controller = new AbortController();
    const params = {};
    if (role) params.role = role;
    if (status) params.status = status;
    api.get('/players', { params, signal: controller.signal })
      .then((r) => setPlayers(r.data))
      .catch((err) => { if (err.name !== 'CanceledError') console.error(err); });
    return () => controller.abort();
  }, [role, status]);

  const phaseOptions = role ? (ROLE_PHASES[role] || []) : [];

  const filtered = useMemo(() => {
    if (!phase || minRating === '') return players;
    const min = Number(minRating);
    if (!Number.isFinite(min)) return players;
    const phaseObj = phaseOptions.find((p) => p.key === phase);
    if (!phaseObj) return players;
    return players.filter((p) => {
      const val = resolvePath(p, phaseObj.key);
      return typeof val === 'number' && val >= min;
    });
  }, [players, phase, minRating, phaseOptions]);

  const openPlayer = async (id) => {
    setLoadingPlayer(true);
    try {
      const { data } = await api.get(`/players/${id}`);
      setSelected(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPlayer(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {selected && <PlayerStatsModal player={selected} onClose={() => setSelected(null)} />}
      {loadingPlayer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <svg className="h-8 w-8 animate-spin text-ipl-gold" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      )}

      <h1 className="text-3xl font-bold text-ipl-gold mb-6">Players</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Role */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2"
        >
          <option value="">All Roles</option>
          {['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2"
        >
          <option value="">All Status</option>
          {['unsold', 'sold', 'in-auction', 'available'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Phase — only shown when a role is selected */}
        {phaseOptions.length > 0 && (
          <select
            value={phase}
            onChange={(e) => { setPhase(e.target.value); setMinRating(''); }}
            className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2"
          >
            <option value="">All Phases</option>
            {phaseOptions.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        )}

        {/* Min rating — only shown when a phase is selected */}
        {phase && (
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2">
            <span className="text-gray-400 text-sm whitespace-nowrap">Min rating</span>
            <input
              type="number"
              min={MIN_RATING}
              max={MAX_RATING}
              step={1}
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              placeholder="e.g. 8"
              className="bg-transparent text-white w-14 text-sm outline-none"
            />
            <span className="text-gray-500 text-sm">/10</span>
          </div>
        )}

        {/* Active filter count badge */}
        {(role || status || phase) && (
          <button
            onClick={() => { setRole(''); setStatus(''); setPhase(''); setMinRating(''); }}
            className="text-xs text-gray-400 border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-500 hover:text-white transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-gray-500 text-sm mb-3">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        {phase && minRating !== '' && (
          <span className="ml-1">
            · {phaseOptions.find((p) => p.key === phase)?.label} ≥ {minRating}/10
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left py-3 px-4">Player</th>
              <th className="text-left py-3 px-4">Role</th>
              <th className="text-left py-3 px-4">Nationality</th>
              <th className="text-right py-3 px-4">Base (Cr)</th>
              <th className="text-right py-3 px-4">Sold (Cr)</th>
              {phase && <th className="text-right py-3 px-4">{phaseOptions.find((p) => p.key === phase)?.label}</th>}
              <th className="text-left py-3 px-4">Team</th>
              <th className="text-left py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const displayStatus = getDisplayStatus(p);
              const phaseVal = phase ? resolvePath(p, phase) : null;
              return (
                <tr
                  key={p._id}
                  onClick={() => openPlayer(p._id)}
                  className="border-b border-gray-800 hover:bg-gray-900 transition cursor-pointer"
                >
                  <td className="py-3 px-4 font-semibold text-white">{p.name}</td>
                  <td className="py-3 px-4 text-gray-300">{p.role}</td>
                  <td className="py-3 px-4 text-gray-300">{p.nationality}</td>
                  <td className="py-3 px-4 text-right text-gray-300">₹{p.basePrice}</td>
                  <td className="py-3 px-4 text-right text-ipl-gold">{p.soldPrice ? `₹${p.soldPrice}` : '-'}</td>
                  {phase && (
                    <td className="py-3 px-4 text-right font-semibold text-blue-300">
                      {typeof phaseVal === 'number' ? `${phaseVal}/10` : '-'}
                    </td>
                  )}
                  <td className="py-3 px-4 text-gray-300">{p.team?.shortName || '-'}</td>
                  <td className={`py-3 px-4 font-semibold capitalize ${STATUS_COLOR[displayStatus] || 'text-gray-400'}`}>
                    {displayStatus}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-gray-600 py-12">No players match these filters.</p>
        )}
      </div>
    </div>
  );
}
