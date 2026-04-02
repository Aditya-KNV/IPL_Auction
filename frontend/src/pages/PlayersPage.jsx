import React, { useEffect, useState } from 'react';
import api from '../services/api';

const STATUS_COLOR = { sold: 'text-green-400', unsold: 'text-red-400', 'in-auction': 'text-yellow-400' };

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [filter, setFilter] = useState({ role: '', status: '' });

  useEffect(() => {
    const params = {};
    if (filter.role) params.role = filter.role;
    if (filter.status) params.status = filter.status;
    api.get('/players', { params }).then(r => setPlayers(r.data)).catch(console.error);
  }, [filter]);

  return (
    <div className="max-w-7xl mx-auto p-6">
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
          {['unsold', 'sold', 'in-auction'].map(s => (
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
              <th className="text-right py-3 px-4">Base (L)</th>
              <th className="text-right py-3 px-4">Sold (L)</th>
              <th className="text-left py-3 px-4">Team</th>
              <th className="text-left py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p._id} className="border-b border-gray-800 hover:bg-gray-900 transition">
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
