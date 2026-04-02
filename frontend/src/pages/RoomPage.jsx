import React, { useState, useEffect } from 'react';
import { useRoom }   from '../context/RoomContext';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import CreateRoomForm from '../components/room/CreateRoomForm';
import JoinRoomForm   from '../components/room/JoinRoomForm';
import RoomLobby      from '../components/room/RoomLobby';
import AuctionBoard   from '../components/auction/AuctionBoard';
import { useMyTeam }  from '../hooks/useMyTeam';
import OtherTeamsPanel from '../components/auction/OtherTeamsPanel';
import MyTeamPanel     from '../components/auction/MyTeamPanel';
import DashboardPage  from './DashboardPage';
import RankingPage    from './RankingPage';
import api from '../services/api';

// ── Players tab ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  sold: 'text-green-400',
  unsold: 'text-red-400',
  'in-auction': 'text-yellow-400',
  available: 'text-gray-400',
};

function PlayersTab() {
  const { socket } = useSocket();
  const [players, setPlayers] = useState([]);
  const [filter,  setFilter]  = useState({ role: '', status: '', auctionSetName: '' });

  const setOptions = [
    'Marquee Set 1',
    'Marquee Set 2',
    'Set 3',
    'Set 4',
    'Set 5',
    'Set 6',
  ];

  const load = () => {
    const params = {};
    if (filter.role)   params.role   = filter.role;
    if (filter.status) params.status = filter.status;
    if (filter.auctionSetName) params.auctionSetName = filter.auctionSetName;
    api.get('/players', { params }).then((r) => setPlayers(r.data)).catch(console.error);
  };

  useEffect(() => { load(); }, [filter]); // re-fetch when filter changes

  // Refresh when a player is sold/unsold
  useEffect(() => {
    if (!socket) return;
    socket.on('auction:sold',   load);
    socket.on('auction:unsold', load);
    return () => {
      socket.off('auction:sold',   load);
      socket.off('auction:unsold', load);
    };
  }, [socket]); // socket is stable after connect

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-ipl-gold mb-6">Players</h2>

      <div className="flex gap-4 mb-6">
        <select
          value={filter.role}
          onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
        >
          <option value="">All Roles</option>
          {['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
        >
          <option value="">All Status</option>
          {['available', 'sold', 'unsold', 'in-auction'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filter.auctionSetName}
          onChange={(e) => setFilter((f) => ({ ...f, auctionSetName: e.target.value }))}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
        >
          <option value="">All Sets</option>
          {setOptions.map((setName) => (
            <option key={setName} value={setName}>{setName}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 bg-gray-900/60">
              <th className="text-left py-3 px-4">Player</th>
              <th className="text-left py-3 px-4">Set</th>
              <th className="text-left py-3 px-4">Role</th>
              <th className="text-left py-3 px-4">Nationality</th>
              <th className="text-right py-3 px-4">Base (Cr)</th>
              <th className="text-right py-3 px-4">Sold (Cr)</th>
              <th className="text-left py-3 px-4">Team</th>
              <th className="text-left py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p._id} className="border-b border-gray-800 hover:bg-gray-900/60 transition">
                <td className="py-3 px-4 font-semibold text-white">{p.name}</td>
                <td className="py-3 px-4 text-gray-400">{p.auctionSetName || '—'}</td>
                <td className="py-3 px-4 text-gray-300">{p.role}</td>
                <td className="py-3 px-4 text-gray-400">{p.nationality}</td>
                <td className="py-3 px-4 text-right text-gray-300">₹{p.basePrice}</td>
                <td className="py-3 px-4 text-right text-ipl-gold font-semibold">
                  {p.soldPrice ? `₹${p.soldPrice}` : '—'}
                </td>
                <td className="py-3 px-4 text-gray-300">{p.team?.shortName || '—'}</td>
                <td className={`py-3 px-4 font-semibold capitalize ${STATUS_COLOR[p.status] || 'text-gray-400'}`}>
                  {p.status}
                </td>
              </tr>
            ))}
            {players.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-gray-600">No players found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Teams tab ─────────────────────────────────────────────────────────────────

function TeamsTab() {
  const { user }            = useAuth();
  const { teamAssignments } = useRoom();
  const { myTeam, allTeams, squadByRole, loading } = useMyTeam();

  const myTeamId = user ? teamAssignments?.[user.id]?.teamId ?? null : null;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-500">Loading teams…</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold text-ipl-gold">Teams</h2>

      {/* My team with full squad */}
      {myTeam && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">My Team</p>
          <MyTeamPanel team={myTeam} squadByRole={squadByRole} />
        </div>
      )}

      {/* All teams comparison */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">All Teams</p>
        <OtherTeamsPanel teams={allTeams} myTeamId={myTeamId} />
      </div>
    </div>
  );
}

// ── In-room tab bar layout ────────────────────────────────────────────────────

const TABS = ['Lobby', 'Auction', 'Teams', 'Players', 'Dashboard', 'Rankings'];

function InRoomLayout() {
  const { room, teamAssignments } = useRoom();
  const { user }   = useAuth();
  const [activeTab, setActiveTab] = useState('Lobby');

  const myAssignment = user ? teamAssignments?.[user.id] : null;

  return (
    <div className="h-full bg-ipl-dark overflow-hidden">
      {/* Tab bar — fixed below the main Navbar */}
      <div className="fixed top-[72px] inset-x-0 z-40 bg-gray-950 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-sm font-semibold transition border-b-2 ${
                activeTab === tab
                  ? 'text-ipl-gold border-ipl-gold'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
              }`}
            >
              {tab}
              {/* Show a dot on Auction tab when there's an active room */}
              {tab === 'Auction' && room && (
                <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
            </button>
          ))}

          {/* Room code pill */}
          <div className="ml-auto flex items-center gap-2 pb-1">
            <span className="text-xs text-gray-500">Room:</span>
            <span className="font-mono font-bold text-ipl-gold text-sm bg-gray-900 px-2 py-0.5 rounded-lg border border-gray-700">
              {room?.code}
            </span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="h-full pt-[57px] overflow-hidden">
        {activeTab === 'Lobby' && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-8">
              <RoomLobby />
            </div>
          </div>
        )}

        {activeTab === 'Auction' && (
          myAssignment ? (
            <div className="h-full overflow-y-auto lg:overflow-hidden">
              <AuctionBoard />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center max-w-sm">
                <p className="text-4xl mb-4">🏏</p>
                <h2 className="text-white font-bold text-xl mb-2">Pick a Team First</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Go to the Lobby tab and select your team before joining the auction.
                </p>
                <button
                  onClick={() => setActiveTab('Lobby')}
                  className="bg-ipl-gold text-black font-bold px-6 py-2.5 rounded-xl hover:brightness-110 transition"
                >
                  Go to Lobby
                </button>
                </div>
              </div>
            </div>
          )
        )}

        {activeTab === 'Teams' && (
          <div className="h-full overflow-y-auto">
            <TeamsTab />
          </div>
        )}
        {activeTab === 'Players' && (
          <div className="h-full overflow-y-auto">
            <PlayersTab />
          </div>
        )}
        {activeTab === 'Dashboard' && (
          <div className="h-full overflow-y-auto">
            <DashboardPage />
          </div>
        )}
        {activeTab === 'Rankings' && (
          <div className="h-full overflow-y-auto">
            <RankingPage />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function RoomPage() {
  const { status, error } = useRoom();

  if (status === 'in-room') return <InRoomLayout />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-ipl-gold">Auction Rooms</h1>
        <p className="text-gray-400 mt-2 text-sm">
          Create a private room or join one with a code
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-6">
          <span>⚠</span> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <CreateRoomForm />
        <JoinRoomForm />
      </div>
    </div>
  );
}
