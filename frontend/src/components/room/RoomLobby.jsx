import React, { useState, useEffect } from 'react';
import { useRoom }   from '../../context/RoomContext';
import { useSocket } from '../../context/SocketContext';
import { useAuth }   from '../../context/AuthContext';
import api           from '../../services/api';

const UserRow = ({ user, isHost, isMe, onKick, canKick, teamAssignments }) => {
  const assignment = Object.entries(teamAssignments).find(([uid]) => uid === user.userId)?.[1];
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition
      ${isMe ? 'bg-neon/[0.05] border-neon/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center
                        font-bold text-sm text-white uppercase">
          {user.username[0]}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{user.username}</span>
          {isMe && <span className="text-[10px] text-white/30">(you)</span>}
          {assignment && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: assignment.color + '22', color: assignment.color, border:`1px solid ${assignment.color}44` }}>
              {assignment.shortName}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isHost && (
          <span className="flex items-center gap-1 text-[9px] font-black tracking-widest
                           text-gold-bright bg-gold-bright/10 border border-gold-bright/25
                           px-2 py-1 rounded-full uppercase">
            HOST
          </span>
        )}
        {canKick && !isHost && !isMe && (
          <button onClick={() => onKick(user.socketId)}
            className="text-[10px] font-semibold text-bid-red/60 hover:text-bid-red
                       border border-bid-red/20 hover:border-bid-red/40
                       px-2.5 py-1 rounded-full transition">
            Kick
          </button>
        )}
      </div>
    </div>
  );
};

const TeamCard = ({ team, takenBy, isMyTeam, onPick }) => {
  const isTaken = !!takenBy && !isMyTeam;
  return (
    <button
      onClick={() => !isTaken && onPick(team)}
      disabled={isTaken}
      className={`relative p-3 rounded-xl border text-left transition-all
        ${isMyTeam
          ? 'scale-[1.03] shadow-lg'
          : isTaken
          ? 'border-white/[0.05] opacity-35 cursor-not-allowed'
          : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04] cursor-pointer'
        }`}
      style={isMyTeam ? { borderColor: team.color, background: team.color + '18', boxShadow:`0 0 16px ${team.color}33` } : {}}
    >
      <div className="w-full h-0.5 rounded-full mb-2.5" style={{ background: team.color }} />
      <p className="text-white font-bold text-sm leading-tight">{team.shortName}</p>
      <p className="text-white/40 text-[10px] truncate mt-0.5">{team.name}</p>
      {takenBy && (
        <p className="text-[10px] mt-1.5 font-semibold truncate" style={{ color: team.color }}>
          {isMyTeam ? '★ Your team' : takenBy}
        </p>
      )}
      {isMyTeam && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-neon
                        shadow-[0_0_8px_rgba(0,255,102,.8)]" />
      )}
    </button>
  );
};

const Toast = ({ message, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-surface-2 border border-white/[0.1]
                    text-white text-sm px-4 py-3 rounded-xl shadow-2xl animate-fade-in">
      {message}
    </div>
  );
};

export default function RoomLobby() {
  const { room, teamAssignments, leaveRoom, kickUser, pickTeam } = useRoom();
  const { socket } = useSocket();
  const { user }   = useAuth();

  const [copied,        setCopied]       = useState(false);
  const [toasts,        setToasts]       = useState([]);
  const [allTeams,      setAllTeams]     = useState([]);
  const [auctionStatus, setAuctionStatus]= useState(null);

  const mySocketId = socket?.id;
  const amHost     = user?.id != null && room?.hostUserId === String(user.id);
  const myAssignment = user ? teamAssignments[user.id] : null;

  useEffect(() => {
    api.get('/teams').then(r => setAllTeams(r.data)).catch(() => {});
    api.get('/auction/session').then(r => setAuctionStatus(r.data?.status ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onStatus    = ({ status }) => setAuctionStatus(status);
    const onCompleted = () => setAuctionStatus('completed');
    socket.on('auction:status',    onStatus);
    socket.on('auction:completed', onCompleted);
    return () => { socket.off('auction:status', onStatus); socket.off('auction:completed', onCompleted); };
  }, [socket]);

  const takenMap = {};
  Object.values(teamAssignments).forEach(a => { takenMap[a.teamId] = a.claimedBy; });

  useEffect(() => {
    if (!socket) return;
    const add = (msg) => setToasts(p => [...p, { id: Date.now(), msg }]);
    socket.on('room:userJoined', ({ user: u }) => add(`${u.username} joined`));
    socket.on('room:userLeft',   ({ username }) => add(`${username} left`));
    return () => { socket.off('room:userJoined'); socket.off('room:userLeft'); };
  }, [socket]);

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const auctionLocked = auctionStatus === 'active' || auctionStatus === 'paused' || auctionStatus === 'completed';
  const handlePickTeam = (team) => {
    if (auctionLocked) return;
    pickTeam({ teamId: team._id, name: team.name, shortName: team.shortName, color: team.color });
  };

  if (!room) return null;

  return (
    <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto">

      {/* Room code */}
      <div className="bg-surface border border-white/[0.07] rounded-2xl p-6">
        <p className="text-[10px] font-bold tracking-[2px] text-white/30 uppercase mb-3">Room Code</p>
        <div className="flex items-center justify-center gap-4">
          <span className="font-bebas text-5xl tracking-[8px] text-neon neon-glow">{room.code}</span>
          <button onClick={copyCode}
            className={`flex items-center gap-1.5 text-xs font-bold tracking-wider
                        border px-3 py-2 rounded-lg transition
                        ${copied ? 'border-neon/30 text-neon bg-neon/10' : 'border-white/[0.1] text-white/50 hover:border-white/20 hover:text-white'}`}>
            {copied ? '✓ COPIED' : 'COPY'}
          </button>
        </div>
        <p className="text-white/25 text-xs text-center mt-3">Share this code with others to join</p>
      </div>

      {/* Team picker */}
      <div className={`bg-surface border rounded-2xl p-6
        ${auctionLocked ? 'border-white/[0.04] opacity-80' : 'border-white/[0.07]'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold tracking-[2px] text-white/40 uppercase">Pick Your Team</p>
            {auctionLocked && (
              <span className="text-[9px] font-black tracking-widest text-gold-bright
                               bg-gold-bright/10 border border-gold-bright/25 px-2 py-0.5 rounded-full uppercase">
                Locked
              </span>
            )}
          </div>
          {myAssignment && (
            <span className="text-xs font-semibold" style={{ color: myAssignment.color }}>
              ★ {myAssignment.shortName}
            </span>
          )}
        </div>

        {allTeams.length === 0 ? (
          <p className="text-white/25 text-sm text-center py-4">Loading teams…</p>
        ) : (
          <div className={`grid grid-cols-4 gap-2 ${auctionLocked ? 'pointer-events-none' : ''}`}>
            {allTeams.map(team => (
              <TeamCard key={team._id} team={team}
                takenBy={takenMap[team._id] ?? null}
                isMyTeam={myAssignment?.teamId === team._id}
                onPick={handlePickTeam}
              />
            ))}
          </div>
        )}

        <p className="text-white/20 text-[11px] mt-4 text-center">
          {auctionLocked
            ? 'Auction underway — head to the Auction tab to bid.'
            : amHost
            ? 'You are the host — pick your team, then share the code.'
            : 'Pick a team before the auction starts. First come, first served.'}
        </p>
      </div>

      {/* Users */}
      <div className="bg-surface border border-white/[0.07] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold tracking-[2px] text-white/40 uppercase">Users in Room</p>
          <span className="text-[10px] text-white/30 bg-white/[0.05] px-2 py-0.5 rounded-full">
            {room.users.length} {room.users.length === 1 ? 'person' : 'people'}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {room.users.map(u => (
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

      {/* Leave */}
      <button onClick={leaveRoom}
        className="w-full border border-bid-red/25 text-bid-red/60 hover:text-bid-red
                   hover:bg-bid-red/[0.07] hover:border-bid-red/40
                   font-semibold py-3 rounded-xl transition text-sm">
        Leave Room
      </button>
      <p className="text-center text-[11px] text-white/20 -mt-3">
        Your team stays reserved unless the host removes you.
      </p>

      {toasts.map(t => (
        <Toast key={t.id} message={t.msg} onDone={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
}
