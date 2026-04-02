import React, { useState, useEffect } from 'react';
import { useRoom } from '../../context/RoomContext';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

// ── User row ──────────────────────────────────────────────────────────────────
const UserRow = ({ user, isHost, isMe, onKick, canKick, teamAssignments }) => {
  const assignment = Object.entries(teamAssignments).find(([uid]) => uid === user.userId)?.[1];
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl transition ${
      isMe ? 'bg-ipl-blue/20 border border-ipl-blue/40' : 'bg-gray-800'
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center font-bold text-sm text-white uppercase">
          {user.username[0]}
        </div>
        <div>
          <span className="text-white font-medium">{user.username}</span>
          {isMe && <span className="ml-2 text-xs text-gray-400">(you)</span>}
          {assignment && (
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: assignment.color + '22', color: assignment.color, border: `1px solid ${assignment.color}44` }}>
              {assignment.shortName}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isHost && (
          <span className="flex items-center gap-1 text-xs font-semibold text-ipl-gold bg-ipl-gold/10 border border-ipl-gold/30 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6l3 6h10l3-6-4 3-4-6-4 6-4-3z" /></svg>
            Host
          </span>
        )}
        {canKick && !isHost && !isMe && (
          <button onClick={() => onKick(user.socketId)}
            className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-0.5 rounded-full transition">
            Kick
          </button>
        )}
      </div>
    </div>
  );
};

// ── Team card ─────────────────────────────────────────────────────────────────
const TeamCard = ({ team, takenBy, isMyTeam, onPick }) => {
  const isTaken = !!takenBy && !isMyTeam;
  return (
    <button
      onClick={() => !isTaken && onPick(team)}
      disabled={isTaken}
      className={`relative p-3 rounded-xl border text-left transition ${
        isMyTeam
          ? 'border-2 scale-[1.02]'
          : isTaken
          ? 'border-gray-700 opacity-40 cursor-not-allowed'
          : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/60 cursor-pointer'
      }`}
      style={isMyTeam ? { borderColor: team.color, background: team.color + '18' } : {}}
    >
      {/* Color bar */}
      <div className="w-full h-1 rounded-full mb-2" style={{ background: team.color }} />
      <p className="text-white font-bold text-sm">{team.shortName}</p>
      <p className="text-gray-400 text-xs truncate">{team.name}</p>
      {takenBy && (
        <p className="text-xs mt-1 font-medium truncate" style={{ color: team.color }}>
          {isMyTeam ? 'Your team' : takenBy}
        </p>
      )}
      {isMyTeam && (
        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-400" />
      )}
    </button>
  );
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const Toast = ({ message, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 bg-gray-800 border border-gray-600 text-white text-sm px-4 py-3 rounded-xl shadow-xl animate-fade-in">
      {message}
    </div>
  );
};

// ── Main Lobby ────────────────────────────────────────────────────────────────
export default function RoomLobby() {
  const { room, teamAssignments, leaveRoom, kickUser, pickTeam } = useRoom();
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [copied,    setCopied]    = useState(false);
  const [toasts,    setToasts]    = useState([]);
  const [allTeams,  setAllTeams]  = useState([]);

  const mySocketId = socket?.id;
  const amHost     = room?.hostId === mySocketId;

  // Find my assignment
  const myAssignment = user ? teamAssignments[user.id] : null;

  // Fetch all teams once
  useEffect(() => {
    api.get('/teams').then((r) => setAllTeams(r.data)).catch(() => {});
  }, []);

  // Build a reverse map: teamId → claimedBy username
  const takenMap = {};
  Object.values(teamAssignments).forEach((a) => {
    takenMap[a.teamId] = a.claimedBy;
  });

  // Toast listeners
  useEffect(() => {
    if (!socket) return;
    const add = (msg) => setToasts((p) => [...p, { id: Date.now(), msg }]);
    socket.on('room:userJoined', ({ user: u }) => add(`${u.username} joined`));
    socket.on('room:userLeft',   ({ username }) => add(`${username} left`));
    return () => { socket.off('room:userJoined'); socket.off('room:userLeft'); };
  }, [socket]);

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePickTeam = (team) => {
    pickTeam({ teamId: team._id, name: team.name, shortName: team.shortName, color: team.color });
  };

  if (!room) return null;

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">

      {/* ── Room code ── */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <div className="bg-gray-800 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-2">Room Code</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-mono font-bold tracking-widest text-ipl-gold">{room.code}</span>
            <button onClick={copyCode}
              className="flex items-center gap-1 text-sm text-gray-300 hover:text-white border border-gray-600 px-3 py-1.5 rounded-lg transition">
              {copied ? <span className="text-green-400">Copied!</span> : 'Copy'}
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-2">Share this code with others to let them join</p>
        </div>
      </div>

      {/* ── Team picker ── */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-300 text-sm font-semibold uppercase tracking-wider">Pick Your Team</h3>
          {myAssignment && (
            <span className="text-xs text-green-400 font-medium">
              You picked: {myAssignment.shortName}
            </span>
          )}
        </div>

        {allTeams.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">Loading teams…</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {allTeams.map((team) => (
              <TeamCard
                key={team._id}
                team={team}
                takenBy={takenMap[team._id] ?? null}
                isMyTeam={myAssignment?.teamId === team._id}
                onPick={handlePickTeam}
              />
            ))}
          </div>
        )}

        <p className="text-gray-600 text-xs mt-3 text-center">
          {amHost ? 'You are the host — pick first, then share the code.' : 'Pick a team before the auction starts. First come, first served.'}
        </p>
      </div>

      {/* ── Users in room ── */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-300 text-sm font-semibold uppercase tracking-wider">Users in Room</h3>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {room.users.length} {room.users.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {room.users.map((u) => (
            <UserRow key={u.socketId} user={u}
              isHost={u.socketId === room.hostId}
              isMe={u.socketId === mySocketId}
              canKick={amHost}
              onKick={kickUser}
              teamAssignments={teamAssignments}
            />
          ))}
        </div>
      </div>

      {/* ── Leave ── */}
      <button onClick={leaveRoom}
        className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/10 font-semibold py-2.5 rounded-xl transition">
        Leave Room
      </button>

      {toasts.map((t) => (
        <Toast key={t.id} message={t.msg} onDone={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
      ))}
    </div>
  );
}
