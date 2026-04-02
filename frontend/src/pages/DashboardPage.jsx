import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [playersRes, teamsRes, sessionRes] = await Promise.all([
        api.get('/players'),
        api.get('/teams'),
        api.get('/auction/session'),
      ]);
      setStats({
        totalPlayers: playersRes.data.length,
        soldPlayers: playersRes.data.filter(p => p.status === 'sold').length,
        unsoldPlayers: playersRes.data.filter(p => p.status === 'unsold').length,
        totalTeams: teamsRes.data.length,
        auctionStatus: sessionRes.data?.status || 'waiting',
      });
    };
    load().catch(console.error);
  }, []);

  const cards = [
    { label: 'Total Players', value: stats?.totalPlayers, color: 'border-ipl-blue' },
    { label: 'Sold', value: stats?.soldPlayers, color: 'border-green-500' },
    { label: 'Unsold', value: stats?.unsoldPlayers, color: 'border-red-500' },
    { label: 'Teams', value: stats?.totalTeams, color: 'border-ipl-gold' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-ipl-gold mb-8">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, color }) => (
          <div key={label} className={`bg-gray-900 rounded-2xl p-6 border-l-4 ${color}`}>
            <p className="text-gray-400 text-sm">{label}</p>
            <p className="text-4xl font-bold text-white mt-1">{value ?? '...'}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/room" className="bg-ipl-gold text-black font-bold py-4 rounded-2xl text-center text-lg hover:brightness-110 transition">
          Enter Auction Room
        </Link>
        <Link to="/ranking" className="bg-ipl-blue text-white font-bold py-4 rounded-2xl text-center text-lg hover:brightness-110 transition">
          Team Rankings
        </Link>
      </div>
    </div>
  );
}
