import React, { useEffect, useState } from 'react';
import api from '../services/api';

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    api.get('/teams').then(r => setTeams(r.data)).catch(console.error);
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-ipl-gold mb-8">Teams</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map(team => (
          <div key={team._id} className="bg-gray-900 rounded-2xl p-6 border border-gray-700" style={{ borderLeftColor: team.color, borderLeftWidth: 4 }}>
            <h2 className="text-xl font-bold text-white">{team.name}</h2>
            <p className="text-gray-400 text-sm">{team.shortName}</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-xs">Remaining Purse</p>
                <p className="text-ipl-gold font-bold">₹{team.remainingPurse}L</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Players Bought</p>
                <p className="text-white font-bold">{team.players?.length} / {team.maxPlayers}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
