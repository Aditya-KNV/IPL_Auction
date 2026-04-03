import React, { useEffect, useState } from 'react';
import api from '../services/api';

const STATUS_COLOR = {
  sold: 'text-green-400',
  unsold: 'text-red-400',
  'in-auction': 'text-yellow-400',
  available: 'text-gray-400',
};

// ── Stat bar ──────────────────────────────────────────────────────────────────

const StatBar = ({ label, value, max = 10, color = 'bg-ipl-gold' }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="tabular-nums font-semibold text-white">{value}<span className="text-gray-600">/{max}</span></span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  </div>
);

// ── Player stats modal ────────────────────────────────────────────────────────

const PlayerStatsModal = ({ player, onClose }) => {
  const hasBowling = player.role === 'Bowler' || player.role === 'All-Rounder' || player.role === 'Wicket-Keeper';
  const hasBatting = player.role !== 'Bowler';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-800 bg-gray-900 px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-white">{player.name}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {player.nationality} · {player.age} yrs · {player.batting_style === 'left-handed' ? 'Left-handed' : 'Right-handed'}
              {player.bowling_style ? ` · ${player.bowling_style}` : ''}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-300">{player.role}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[player.status] ?? 'text-gray-400'}`}>
                {player.status}
              </span>
              {player.team && (
                <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-ipl-gold">
                  {player.team.shortName ?? player.team.name}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 mt-1 flex-shrink-0 text-gray-500 hover:text-white">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Price */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Base Price</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-gray-200">₹{player.basePrice} Cr</p>
            </div>
            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Sold Price</p>
              <p className={`mt-0.5 text-lg font-black tabular-nums ${player.soldPrice ? 'text-ipl-gold' : 'text-gray-600'}`}>
                {player.soldPrice ? `₹${player.soldPrice} Cr` : '—'}
              </p>
            </div>
          </div>

          {/* Batting */}
          {hasBatting && (
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-400">Batting — Phases</p>
              <div className="space-y-3">
                <StatBar label="Powerplay" value={player.batting?.phases?.powerplay?.rating ?? 0} color="bg-blue-500" />
                <StatBar label="Middle Overs" value={player.batting?.phases?.middle?.rating ?? 0} color="bg-blue-500" />
                <StatBar label="Death Overs" value={player.batting?.phases?.death?.rating ?? 0} color="bg-blue-500" />
              </div>
              <p className="mb-3 mt-4 text-xs font-bold uppercase tracking-wider text-blue-400">Batting — Skills</p>
              <div className="space-y-3">
                <StatBar label="Finishing" value={player.batting?.skills?.finishing ?? 0} color="bg-sky-500" />
                <StatBar label="Power Hitting" value={player.batting?.skills?.power_hitting ?? 0} color="bg-sky-500" />
                <StatBar label="Anchor" value={player.batting?.skills?.anchor ?? 0} color="bg-sky-500" />
                <StatBar label="Spin Play" value={player.batting?.skills?.spin_play ?? 0} color="bg-sky-500" />
                <StatBar label="Pace Play" value={player.batting?.skills?.pace_play ?? 0} color="bg-sky-500" />
              </div>
            </div>
          )}

          {/* Bowling */}
          {hasBowling && (
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-red-400">Bowling — Phases</p>
              <div className="space-y-3">
                <StatBar label="Powerplay" value={player.bowling?.phases?.powerplay ?? 0} color="bg-red-500" />
                <StatBar label="Middle Overs" value={player.bowling?.phases?.middle ?? 0} color="bg-red-500" />
                <StatBar label="Death Overs" value={player.bowling?.phases?.death ?? 0} color="bg-red-500" />
              </div>
              <p className="mb-3 mt-4 text-xs font-bold uppercase tracking-wider text-red-400">Bowling — Skills</p>
              <div className="space-y-3">
                <StatBar label="Variations" value={player.bowling?.skills?.variations ?? 0} color="bg-rose-500" />
                <StatBar label="Yorker" value={player.bowling?.skills?.yorker ?? 0} color="bg-rose-500" />
                <StatBar label="Bouncer" value={player.bowling?.skills?.bouncer ?? 0} color="bg-rose-500" />
              </div>
              <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
                <span className="text-gray-400">Overs quota: </span>
                <span className="font-semibold text-white">{player.tactical?.overs ?? 0} overs</span>
              </div>
            </div>
          )}

          {/* Impact */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-400">Role Impact</p>
            <div className="space-y-3">
              <StatBar label="Match Winner" value={player.role_impact?.match_winner ?? 0} color="bg-amber-500" />
              <StatBar label="Clutch" value={player.role_impact?.clutch ?? 0} color="bg-amber-500" />
              <StatBar label="Consistency" value={player.role_impact?.consistency ?? 0} color="bg-amber-500" />
            </div>
          </div>

          {/* Fitness & Tactical */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-green-400">Fitness & Tactical</p>
            <div className="space-y-3">
              <StatBar label="Stamina" value={player.fitness?.stamina ?? 0} color="bg-green-500" />
              <StatBar label="Injury Risk (lower = better)" value={10 - (player.fitness?.injury_risk ?? 5)} color="bg-green-500" />
              <StatBar label="Tactical Flexibility" value={player.tactical?.flexibility ?? 0} color="bg-emerald-500" />
            </div>
            {player.tactical?.positions?.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
                <span className="text-gray-400">Preferred batting positions: </span>
                <span className="font-semibold text-white">{player.tactical.positions.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [filter, setFilter] = useState({ role: '', status: '' });
  const [selected, setSelected] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = {};
    if (filter.role) params.role = filter.role;
    if (filter.status) params.status = filter.status;
    api.get('/players', { params, signal: controller.signal })
      .then(r => setPlayers(r.data))
      .catch(err => { if (err.name !== 'CanceledError') console.error(err); });
    return () => controller.abort();
  }, [filter]);

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

      <div className="flex gap-4 mb-6">
        <select value={filter.role} onChange={e => setFilter({ ...filter, role: e.target.value })}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2">
          <option value="">All Roles</option>
          {['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2">
          <option value="">All Status</option>
          {['unsold', 'sold', 'in-auction', 'available'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left py-3 px-4">Player</th>
              <th className="text-left py-3 px-4">Role</th>
              <th className="text-left py-3 px-4">Nationality</th>
              <th className="text-right py-3 px-4">Base (Cr)</th>
              <th className="text-right py-3 px-4">Sold (Cr)</th>
              <th className="text-left py-3 px-4">Team</th>
              <th className="text-left py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
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
                <td className="py-3 px-4 text-gray-300">{p.team?.shortName || '-'}</td>
                <td className={`py-3 px-4 font-semibold capitalize ${STATUS_COLOR[p.status]}`}>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
