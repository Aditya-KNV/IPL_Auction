import React, { useState, useEffect, useMemo } from 'react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import CreateRoomForm from '../components/room/CreateRoomForm';
import JoinRoomForm from '../components/room/JoinRoomForm';
import RoomLobby from '../components/room/RoomLobby';
import AuctionBoard from '../components/auction/AuctionBoard';
import { useMyTeam } from '../hooks/useMyTeam';
import OtherTeamsPanel from '../components/auction/OtherTeamsPanel';
import MyTeamPanel from '../components/auction/MyTeamPanel';
import PlayerStatsModal from '../components/players/PlayerStatsModal';
import DashboardPage from './DashboardPage';
import RankingPage from './RankingPage';
import api from '../services/api';
import { STATUS_COLOR, getDisplayStatus } from '../utils/playerDisplay';

// Groups of filter options per role — each group renders as an <optgroup>
const ROLE_FILTERS = {
  Batsman: [
    {
      group: 'Batting Phases',
      options: [
        { label: 'Powerplay', key: 'batting.phases.powerplay.rating' },
        { label: 'Middle',    key: 'batting.phases.middle.rating'    },
        { label: 'Death',     key: 'batting.phases.death.rating'     },
      ],
    },
    {
      group: 'Batting Skills',
      options: [
        { label: 'Finishing',    key: 'batting.skills.finishing'     },
        { label: 'Power Hitting',key: 'batting.skills.power_hitting' },
        { label: 'Anchor',       key: 'batting.skills.anchor'        },
        { label: 'Spin Play',    key: 'batting.skills.spin_play'     },
        { label: 'Pace Play',    key: 'batting.skills.pace_play'     },
      ],
    },
  ],
  Bowler: [
    {
      group: 'Bowling Phases',
      options: [
        { label: 'Powerplay', key: 'bowling.phases.powerplay' },
        { label: 'Middle',    key: 'bowling.phases.middle'    },
        { label: 'Death',     key: 'bowling.phases.death'     },
      ],
    },
    {
      group: 'Bowling Skills',
      options: [
        { label: 'Variations', key: 'bowling.skills.variations' },
        { label: 'Yorker',     key: 'bowling.skills.yorker'     },
        { label: 'Bouncer',    key: 'bowling.skills.bouncer'    },
      ],
    },
  ],
  'All-Rounder': [
    {
      group: 'Batting Phases',
      options: [
        { label: 'Bat Powerplay', key: 'batting.phases.powerplay.rating' },
        { label: 'Bat Middle',    key: 'batting.phases.middle.rating'    },
        { label: 'Bat Death',     key: 'batting.phases.death.rating'     },
      ],
    },
    {
      group: 'Batting Skills',
      options: [
        { label: 'Finishing',     key: 'batting.skills.finishing'     },
        { label: 'Power Hitting', key: 'batting.skills.power_hitting' },
        { label: 'Anchor',        key: 'batting.skills.anchor'        },
        { label: 'Spin Play',     key: 'batting.skills.spin_play'     },
        { label: 'Pace Play',     key: 'batting.skills.pace_play'     },
      ],
    },
    {
      group: 'Bowling Phases',
      options: [
        { label: 'Bowl Powerplay', key: 'bowling.phases.powerplay' },
        { label: 'Bowl Middle',    key: 'bowling.phases.middle'    },
        { label: 'Bowl Death',     key: 'bowling.phases.death'     },
      ],
    },
    {
      group: 'Bowling Skills',
      options: [
        { label: 'Variations', key: 'bowling.skills.variations' },
        { label: 'Yorker',     key: 'bowling.skills.yorker'     },
        { label: 'Bouncer',    key: 'bowling.skills.bouncer'    },
      ],
    },
  ],
  'Wicket-Keeper': [
    {
      group: 'Batting Phases',
      options: [
        { label: 'Powerplay', key: 'batting.phases.powerplay.rating' },
        { label: 'Middle',    key: 'batting.phases.middle.rating'    },
        { label: 'Death',     key: 'batting.phases.death.rating'     },
      ],
    },
    {
      group: 'Batting Skills',
      options: [
        { label: 'Finishing',     key: 'batting.skills.finishing'     },
        { label: 'Power Hitting', key: 'batting.skills.power_hitting' },
        { label: 'Anchor',        key: 'batting.skills.anchor'        },
        { label: 'Spin Play',     key: 'batting.skills.spin_play'     },
        { label: 'Pace Play',     key: 'batting.skills.pace_play'     },
      ],
    },
  ],
};

const resolvePath = (obj, path) =>
  path.split('.').reduce((cur, k) => (cur != null ? cur[k] : undefined), obj);

const SET_OPTIONS = ['Marquee Set 1', 'Marquee Set 2', 'Set 3', 'Set 4', 'Set 5', 'Set 6'];

function PlayersTab() {
  const { socket } = useSocket();
  const [players, setPlayers] = useState([]);
  const [role, setRole]                   = useState('');
  const [status, setStatus]               = useState('');
  const [auctionSetName, setAuctionSetName] = useState('');
  const [phase, setPhase]                 = useState('');
  const [minRating, setMinRating]         = useState('');
  const [selected, setSelected]           = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  // Reset phase/rating when role changes
  useEffect(() => { setPhase(''); setMinRating(''); }, [role]);

  const load = () => {
    const params = {};
    if (role) params.role = role;
    if (status) params.status = status;
    if (auctionSetName) params.auctionSetName = auctionSetName;
    api.get('/players', { params }).then((r) => setPlayers(r.data)).catch(console.error);
  };

  useEffect(() => { load(); }, [role, status, auctionSetName]);

  useEffect(() => {
    if (!socket) return;
    socket.on('auction:sold', load);
    socket.on('auction:unsold', load);
    return () => {
      socket.off('auction:sold', load);
      socket.off('auction:unsold', load);
    };
  }, [socket]);

  const filterGroups = role ? (ROLE_FILTERS[role] || []) : [];
  const allFilterOptions = filterGroups.flatMap((g) => g.options);

  const filtered = useMemo(() => {
    if (!phase || minRating === '') return players;
    const min = Number(minRating);
    if (!Number.isFinite(min)) return players;
    return players.filter((p) => {
      const val = resolvePath(p, phase);
      return typeof val === 'number' && val >= min;
    });
  }, [players, phase, minRating]);

  const activeFilterLabel = allFilterOptions.find((o) => o.key === phase)?.label;

  const openPlayer = async (id) => {
    setLoadingPlayer(true);
    try {
      const { data } = await api.get(`/players/${id}`);
      setSelected(data);
    } catch (err) {
      console.error(err);
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

      <h2 className="text-2xl font-bold text-ipl-gold mb-6">Players</h2>

      <div className="flex flex-wrap gap-3 mb-4">
        {/* Role */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
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
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
        >
          <option value="">All Status</option>
          {['available', 'sold', 'unsold', 'in-auction'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Set */}
        <select
          value={auctionSetName}
          onChange={(e) => setAuctionSetName(e.target.value)}
          className="bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
        >
          <option value="">All Sets</option>
          {SET_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Phase/Skill — only when role is selected */}
        {filterGroups.length > 0 && (
          <select
            value={phase}
            onChange={(e) => { setPhase(e.target.value); setMinRating(''); }}
            className="bg-gray-800 border border-blue-500/40 text-white rounded-lg px-4 py-2 text-sm"
          >
            <option value="">Phase / Skill</option>
            {filterGroups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {/* Min rating — only when phase is selected */}
        {phase && (
          <div className="flex items-center gap-2 bg-gray-800 border border-blue-500/40 rounded-lg px-3 py-2">
            <span className="text-gray-400 text-sm whitespace-nowrap">Min rating</span>
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              placeholder="e.g. 8"
              className="bg-transparent text-white w-12 text-sm outline-none"
            />
            <span className="text-gray-500 text-sm">/10</span>
          </div>
        )}

        {/* Clear */}
        {(role || status || auctionSetName || phase) && (
          <button
            onClick={() => { setRole(''); setStatus(''); setAuctionSetName(''); setPhase(''); setMinRating(''); }}
            className="text-xs text-gray-400 border border-gray-700 rounded-lg px-3 py-2 hover:border-gray-500 hover:text-white transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Result summary */}
      <p className="text-gray-500 text-xs mb-3">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        {activeFilterLabel && minRating !== '' && (
          <span className="ml-1 text-blue-400">· {activeFilterLabel} ≥ {minRating}/10</span>
        )}
      </p>

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
              {phase && <th className="text-right py-3 px-4">{activeFilterLabel}</th>}
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
                  className="border-b border-gray-800 hover:bg-gray:900/60 transition cursor-pointer"
                >
                  <td className="py-3 px-4 font-semibold text-white">{p.name}</td>
                  <td className="py-3 px-4 text-gray-400">{p.auctionSetName || '—'}</td>
                  <td className="py-3 px-4 text-gray-300">{p.role}</td>
                  <td className="py-3 px-4 text-gray-400">{p.nationality}</td>
                  <td className="py-3 px-4 text-right text-gray-300">₹{p.basePrice}</td>
                  <td className="py-3 px-4 text-right text-ipl-gold font-semibold">
                    {p.soldPrice ? `₹${p.soldPrice}` : '—'}
                  </td>
                  {phase && (
                    <td className="py-3 px-4 text-right font-semibold text-blue-300">
                      {typeof phaseVal === 'number' ? `${phaseVal}/10` : '—'}
                    </td>
                  )}
                  <td className="py-3 px-4 text-gray-300">{p.team?.shortName || '—'}</td>
                  <td className={`py-3 px-4 font-semibold capitalize ${STATUS_COLOR[displayStatus] || 'text-gray-400'}`}>
                    {displayStatus}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={phase ? 9 : 8} className="py-10 text-center text-gray-600">No players found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamsTab() {
  const { user } = useAuth();
  const { teamAssignments } = useRoom();
  const { myTeam, allTeams, squadByRole, loading } = useMyTeam();

  const myTeamId = user ? teamAssignments?.[user.id]?.teamId ?? null : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Loading teams...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold text-ipl-gold">Teams</h2>

      {myTeam && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">My Team</p>
          <MyTeamPanel team={myTeam} squadByRole={squadByRole} />
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">All Teams</p>
        <OtherTeamsPanel teams={allTeams} myTeamId={myTeamId} />
      </div>
    </div>
  );
}

const TABS = ['Lobby', 'Auction', 'Teams', 'Players', 'Dashboard', 'Rankings'];

function InRoomLayout() {
  const { room, teamAssignments } = useRoom();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Lobby');

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const myAssignment = user ? teamAssignments?.[user.id] : null;

  return (
    <div className="h-full bg-ipl-dark overflow-hidden">
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
              {tab === 'Auction' && room && (
                <span className="absolute top-2 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 pb-1">
            <span className="text-xs text-gray-500">Room:</span>
            <span className="font-mono font-bold text-ipl-gold text-sm bg-gray-900 px-2 py-0.5 rounded-lg border border-gray-700">
              {room?.code}
            </span>
          </div>
        </div>
      </div>

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
