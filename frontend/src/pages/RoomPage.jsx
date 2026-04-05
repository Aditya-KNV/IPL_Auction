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
  const [search, setSearch]               = useState('');
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
    let result = players;
    if (phase && minRating !== '') {
      const min = Number(minRating);
      if (Number.isFinite(min)) {
        result = result.filter((p) => {
          const val = resolvePath(p, phase);
          return typeof val === 'number' && val >= min;
        });
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [players, phase, minRating, search]);

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
        {/* Search by name */}
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2">
          <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player…"
            className="bg-transparent text-white text-sm outline-none w-36 placeholder-gray-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-500 hover:text-white ml-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

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
        {(role || status || auctionSetName || phase || search) && (
          <button
            onClick={() => { setRole(''); setStatus(''); setAuctionSetName(''); setPhase(''); setMinRating(''); setSearch(''); }}
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

function SettingsTab() {
  const { room, transferHost } = useRoom();
  const { socket } = useSocket();
  const [timerDuration, setTimerDuration] = useState(10);
  const [timerSaved, setTimerSaved] = useState(false);
  const [selectedSocketId, setSelectedSocketId] = useState('');

  const mySocketId = socket?.id;
  const amHost = room?.hostId === mySocketId;

  // Load current timer duration from session
  useEffect(() => {
    api.get('/auction/session').then((r) => {
      if (r.data?.timerDuration) setTimerDuration(r.data.timerDuration);
    }).catch(() => {});
  }, []);

  // Keep timer in sync when host changes it
  useEffect(() => {
    if (!socket) return;
    const onTimerUpdated = ({ timerDuration: d }) => setTimerDuration(d);
    socket.on('settings:timer-updated', onTimerUpdated);
    return () => socket.off('settings:timer-updated', onTimerUpdated);
  }, [socket]);

  const saveTimer = () => {
    socket?.emit('settings:update-timer', { duration: timerDuration });
    setTimerSaved(true);
    setTimeout(() => setTimerSaved(false), 2000);
  };

  const handleTransferHost = () => {
    if (!selectedSocketId) return;
    transferHost(selectedSocketId);
    setSelectedSocketId('');
  };

  const otherUsers = room?.users.filter((u) => u.socketId !== mySocketId) || [];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-bold text-ipl-gold">Settings</h2>

      {!amHost && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 text-center text-gray-500 text-sm">
          Only the host can change room settings.
        </div>
      )}

      {/* Timer */}
      <div className={`bg-gray-900 border rounded-2xl p-6 ${amHost ? 'border-gray-700' : 'border-gray-800 opacity-50 pointer-events-none'}`}>
        <h3 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-1">Auction Timer</h3>
        <p className="text-gray-500 text-xs mb-4">
          Initial bidding window duration when a player enters auction. Each bid extends the clock by 10 s regardless.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={timerDuration}
            onChange={(e) => setTimerDuration(Number(e.target.value))}
            className="flex-1 accent-ipl-gold"
          />
          <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
            <input
              type="number"
              min={5}
              max={120}
              step={1}
              value={timerDuration}
              onChange={(e) => setTimerDuration(Number(e.target.value))}
              className="bg-transparent text-white text-sm w-10 outline-none text-center tabular-nums"
            />
            <span className="text-gray-500 text-sm">s</span>
          </div>
          <button
            onClick={saveTimer}
            className="bg-ipl-gold text-black font-bold px-4 py-2 rounded-xl text-sm hover:brightness-110 transition"
          >
            {timerSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Transfer Host */}
      <div className={`bg-gray-900 border rounded-2xl p-6 ${amHost ? 'border-gray-700' : 'border-gray-800 opacity-50 pointer-events-none'}`}>
        <h3 className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-1">Transfer Host</h3>
        <p className="text-gray-500 text-xs mb-4">
          Hand off host controls to another user in the room. You will become a regular participant.
        </p>
        {otherUsers.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-2">No other users in the room.</p>
        ) : (
          <div className="flex items-center gap-3">
            <select
              value={selectedSocketId}
              onChange={(e) => setSelectedSocketId(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-2 text-sm"
            >
              <option value="">Select user…</option>
              {otherUsers.map((u) => (
                <option key={u.socketId} value={u.socketId}>{u.username}</option>
              ))}
            </select>
            <button
              onClick={handleTransferHost}
              disabled={!selectedSocketId}
              className="bg-ipl-blue text-white font-bold px-4 py-2 rounded-xl text-sm hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Transfer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = ['Lobby', 'Auction', 'Teams', 'Players', 'Dashboard', 'Rankings', 'Rules', 'Settings'];

function RulesTab() {
  const Section = ({ title, children }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
      <h2 className="text-ipl-gold font-bold text-lg mb-4 border-b border-gray-800 pb-2">{title}</h2>
      {children}
    </div>
  );

  const Table = ({ headers, rows }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            {headers.map((h) => (
              <th key={h} className="text-left text-gray-400 font-semibold py-2 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-ipl-gold mb-2">Rules & Rating Schema</h1>
      <p className="text-gray-400 text-sm mb-8">Complete reference for how bidding, budgets, squads, and player scores are calculated.</p>

      {/* ── BIDDING RULES ── */}
      <Section title="Bidding Rules">
        <Table
          headers={['Rule', 'Value']}
          rows={[
            ['Minimum bid increment', '0.2 Crores (20 Lakhs)'],
            ['Quick bid buttons', '+0.2 Cr, +0.5 Cr, +1 Cr'],
            ['First bid', 'Must be ≥ player\'s base price (no increment needed)'],
            ['Subsequent bids', 'Must be ≥ current bid + 0.2 Cr'],
            ['Bid timer', '10 seconds default (configurable 5–120s, host only)'],
            ['Timer reset', 'Each valid bid resets the countdown'],
            ['Withdrawal', 'Highest bidder cannot withdraw; others can at any time'],
            ['All withdraw', 'Player marked UNSOLD'],
            ['One team left', 'Player SOLD to remaining bidder'],
          ]}
        />
      </Section>

      {/* ── TEAM BUDGET ── */}
      <Section title="Team Budget & Purse">
        <Table
          headers={['Rule', 'Value']}
          rows={[
            ['Starting purse per team', '120 Crores'],
            ['Purse deduction', 'Exact final bid amount (2 decimal places)'],
            ['Bid blocked when', 'remaining purse < bid amount'],
            ['Purse on reset', 'Restored to full 120 Crores'],
          ]}
        />
      </Section>

      {/* ── SQUAD COMPOSITION ── */}
      <Section title="Squad Composition Rules">
        <Table
          headers={['Rule', 'Value']}
          rows={[
            ['Max squad size', '25 players'],
            ['Playing-12 size', 'Exactly 12'],
            ['Max overseas in Playing-12', '4'],
            ['Max overseas in squad (≤18 player cap)', '6'],
            ['Max overseas in squad (25 player cap)', '8'],
            ['Min Indian players for full Playing-12', '8'],
            ['Overseas definition', 'Any player whose nationality ≠ Indian (case-insensitive)'],
          ]}
        />
      </Section>

      {/* ── PLAYER ROLES ── */}
      <Section title="Player Roles & Batting Positions">
        <Table
          headers={['Role', 'Bats at', 'Bowls']}
          rows={[
            ['Batsman', '1–8', 'No'],
            ['Bowler', '9–12 only', 'Yes'],
            ['All-Rounder', '1–9', 'Yes'],
            ['Wicket-Keeper', '1–8', 'No'],
          ]}
        />
        <p className="text-gray-500 text-xs mt-3">All individual ratings are on a 0–10 scale.</p>
      </Section>

      {/* ── TEAM SCORE OVERVIEW ── */}
      <Section title="Team Score Overview (0–100)">
        <p className="text-gray-300 text-sm mb-4">Final team score is the sum of 7 components:</p>
        <div className="bg-gray-800/60 rounded-xl p-4 font-mono text-sm text-ipl-gold mb-4">
          Final Score = Batting + Bowling + Fitness + Impact + Tactical + Age + Captaincy
        </div>
        <Table
          headers={['Component', 'Max Points', 'Formula']}
          rows={[
            ['Batting', '~40', 'Keeper Score + Left-Right Balance + Position Fit'],
            ['Bowling', '~40', 'Overs + Pace + Spin + Powerplay + Middle + Death phases'],
            ['Fitness', '5', 'avg(stamina, 10 − injury_risk) × 0.5'],
            ['Impact', '5', 'avg(match_winner, clutch, consistency) × 0.7'],
            ['Tactical', '3', 'avg(flexibility of all players) × 0.3'],
            ['Age', '1', 'clamp(1 − |avg_age − 30| / 15, 0, 1)  —  optimal age = 30'],
            ['Captaincy', '4', 'Stepped: full 4 pts when total captaincy ≥ 1.75, drops 0.5 per 0.25 below'],
          ]}
        />
      </Section>

      {/* ── BATTING SCORING ── */}
      <Section title="Batting Score Breakdown">
        <h3 className="text-white font-semibold text-sm mb-2">1. Wicket-Keeper Score</h3>
        <Table
          headers={['Condition', 'Points']}
          rows={[
            ['2 fit keepers', '4.0'],
            ['1 keeper, injury risk ≤ 3', '2.5'],
            ['1 keeper, normal risk', '2.0'],
            ['No keeper', '0'],
          ]}
        />

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">2. Left-Right Balance (Max 3 pts)</h3>
        <div className="bg-gray-800/60 rounded-xl px-4 py-3 font-mono text-sm text-ipl-gold mb-1">
          Score = 3 × (min(left, right) / max(left, right))
        </div>
        <p className="text-gray-500 text-xs">Counts batters and all-rounders only. Zero if only one handedness exists.</p>

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">3. Position Fit Score (Max 34 pts)</h3>
        <p className="text-gray-400 text-xs mb-3">Dynamic programming assigns players to optimal batting slots. Each slot has a maximum:</p>
        <Table
          headers={['Position', 'Slot Max', 'Dominant Rating Weights']}
          rows={[
            ['1–2 (Openers)', '4.5 each', '50% powerplay, 15% pace play, 10% middle'],
            ['3–4 (Top order)', '4.5 each', '40% middle, 20% powerplay, 10% pace/spin'],
            ['5–6 (Middle order)', '4.0 each', '30% middle, 20% death, 10% pace/spin'],
            ['7–8 (Lower middle)', '3.5 each', '40% death, 10% pace / finishing / power-hitting'],
            ['9–12 (Tail)', '0.25 each (shared)', '60% power-hitting, 40% finishing'],
          ]}
        />
        <div className="mt-3 space-y-1 text-xs text-gray-400">
          <p>• Bowlers can only occupy positions 9–12.</p>
          <p>• All-Rounder at position 9 receives a <span className="text-green-400">+2 bonus</span> (if total position fit ≤ 34).</p>
          <p>• Batting outside preferred positions: <span className="text-red-400">−3 penalty</span>.</p>
        </div>
      </Section>

      {/* ── BOWLING SCORING ── */}
      <Section title="Bowling Score Breakdown">
        <h3 className="text-white font-semibold text-sm mb-2">1. Total Overs Score (Max 3 pts)</h3>
        <Table
          headers={['Overs', 'Score']}
          rows={[['24+', '3.0'], ['23', '2.5'], ['22', '2.0'], ['21', '1.0'], ['20', '0.5'], ['< 20', '0']]}
        />

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">2. Pace Overs Score (Max 3 pts)</h3>
        <Table
          headers={['Pace Overs', 'Score']}
          rows={[['14+', '2.5'], ['13', '2.0'], ['12', '1.5'], ['11', '1.0'], ['10', '0.5'], ['< 10', '0']]}
        />
        <p className="text-gray-500 text-xs mt-1">+0.5 bonus if squad has both left-arm and right-arm pacers (cap 3.0 total).</p>

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">3. Spin Overs Score (Max 3 pts)</h3>
        <Table
          headers={['Spin Overs', 'Score']}
          rows={[['10+', '2.5'], ['9', '2.0'], ['8', '1.5'], ['7', '1.0'], ['6', '0.5'], ['< 6', '0']]}
        />
        <p className="text-gray-500 text-xs mt-1">+0.5 bonus for complementary spin archetypes (off-spin + leg-spin combo).</p>

        <h3 className="text-white font-semibold text-sm mt-5 mb-2">4. Phase Bowling Scores</h3>
        <p className="text-gray-400 text-xs mb-3">Requires ≥ 2 eligible bowlers. Takes top 4 bowlers per phase.<br />
          Effective rating = base rating if designated for that phase, else base − 2.</p>
        <div className="bg-gray-800/60 rounded-xl px-4 py-3 font-mono text-sm text-ipl-gold mb-3">
          Phase Score = avg(top 4 effective ratings) × multiplier  [clamped to max]
        </div>
        <Table
          headers={['Phase', 'Multiplier', 'Max Points']}
          rows={[['Powerplay', '1.0×', '10'], ['Middle', '1.1×', '11'], ['Death', '1.0×', '10']]}
        />
      </Section>

      {/* ── SUPPLEMENTARY SCORES ── */}
      <Section title="Supplementary Score Formulas">
        <div className="space-y-4">
          {[
            { label: 'Fitness (Max 5)', formula: 'avg(stamina,  10 − injury_risk)  ×  0.5', attrs: 'fitness.stamina, fitness.injury_risk' },
            { label: 'Impact (Max 5)', formula: 'avg(match_winner,  clutch,  consistency)  ×  0.7', attrs: 'role_impact.match_winner / clutch / consistency' },
            { label: 'Tactical (Max 3)', formula: 'avg(flexibility of all players)  ×  0.3', attrs: 'tactical.flexibility' },
            { label: 'Age (Max 1)', formula: 'clamp(1 − |avg_age − 30| / 15,  0,  1)', attrs: 'Player age — optimal team average = 30 years' },
            { label: 'Captaincy (Max 4)', formula: 'steps = floor(max(0, 1.75 − total_cap) / 0.25)\nScore = max(0, 4 − steps × 0.5)', attrs: 'tactical.captaincy (summed across squad)' },
          ].map(({ label, formula, attrs }) => (
            <div key={label} className="bg-gray-800/40 rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-1">{label}</p>
              <pre className="font-mono text-xs text-ipl-gold whitespace-pre-wrap mb-1">{formula}</pre>
              <p className="text-gray-500 text-xs">Source fields: {attrs}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── GAME CONSTANTS ── */}
      <Section title="Game Constants">
        <Table
          headers={['Constant', 'Value']}
          rows={[
            ['Teams', '10 (MI, CSK, RCB, KKR, RR, DC, SRH, PBKS, GT, LSG)'],
            ['Starting purse per team', '120 Crores'],
            ['Max squad size', '25 players'],
            ['Playing-12 overseas cap', '4 players'],
            ['Min bid increment', '0.2 Crores'],
            ['Default auction timer', '10 seconds'],
            ['Bid normalization', '2 decimal places'],
            ['Optimal captain score threshold', '≥ 1.75 total captaincy for full 4 pts'],
            ['Optimal team average age', '30 years'],
          ]}
        />
      </Section>
    </div>
  );
}

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
        <div className="max-w-7xl mx-auto px-2 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-shrink-0 px-4 py-3 text-sm font-semibold transition border-b-2 ${
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

          <div className="flex-shrink-0 ml-2 flex items-center gap-2 pb-1">
            <span className="text-xs text-gray-500 hidden sm:inline">Room:</span>
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
        {activeTab === 'Rules' && (
          <div className="h-full overflow-y-auto">
            <RulesTab />
          </div>
        )}
        {activeTab === 'Settings' && (
          <div className="h-full overflow-y-auto">
            <SettingsTab />
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
