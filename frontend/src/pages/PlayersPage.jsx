import React, { useEffect, useState } from 'react';
import PlayerStatsModal from '../components/players/PlayerStatsModal';
import api from '../services/api';
import { STATUS_COLOR, getDisplayStatus } from '../utils/playerDisplay';

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
      .then((r) => setPlayers(r.data))
      .catch((err) => { if (err.name !== 'CanceledError') console.error(err); });
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
        <select
          value={filter.role}
          onChange={(e) => setFilter({ ...filter, role: e.target.value })}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2"
        >
          <option value="">All Roles</option>
          {['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2"
        >
          <option value="">All Status</option>
          {['unsold', 'sold', 'in-auction', 'available'].map((s) => (
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
            {players.map((p) => {
              const displayStatus = getDisplayStatus(p);
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
                  <td className="py-3 px-4 text-gray-300">{p.team?.shortName || '-'}</td>
                  <td className={`py-3 px-4 font-semibold capitalize ${STATUS_COLOR[displayStatus] || 'text-gray-400'}`}>
                    {displayStatus}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
