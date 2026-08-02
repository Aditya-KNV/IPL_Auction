import React, { useState } from 'react';
import { formatCroreAmount, normalizeCroreAmount } from '../../utils/currency';
import PlayerStatsModal from '../players/PlayerStatsModal';
import { useRoom } from '../../context/RoomContext';
import api from '../../services/api';

const ROLE_COLOR = {
  Batsman:        '#3b82f6',
  Bowler:         '#ef4444',
  'All-Rounder':  '#a855f7',
  'Wicket-Keeper':'#f59e0b',
};
const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];

const isOverseas = (p) => {
  const nat = String(p?.nationality || '').trim().toLowerCase();
  return nat.length > 0 && nat !== 'indian';
};

const SquadList = ({ players, onPlayerClick, loadingId }) => {
  if (!players?.length) return (
    <p className="text-white/20 text-xs text-center py-3">No players bought yet</p>
  );

  const byRole = players.reduce((acc, p) => {
    const k = p.role || 'Other';
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});
  const orderedRoles = [
    ...ROLE_ORDER.filter(r => byRole[r]?.length),
    ...Object.keys(byRole).filter(r => !ROLE_ORDER.includes(r) && byRole[r]?.length),
  ];

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {orderedRoles.map(role => (
        <div key={role}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-1 px-1"
             style={{ color: ROLE_COLOR[role] || '#6b7280' }}>
            {role}s ({byRole[role].length})
          </p>
          <div className="flex flex-col gap-0.5">
            {byRole[role].map(p => (
              <button key={p._id} onClick={() => onPlayerClick(p._id)}
                disabled={!!loadingId}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg
                           bg-white/[0.03] hover:bg-white/[0.07] transition text-left w-full
                           disabled:opacity-50">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ROLE_COLOR[p.role] || '#6b7280' }} />
                  <span className="text-xs text-white/70 truncate">
                    {p.name}
                    {isOverseas(p) && <span className="ml-1 text-sky-400 text-[10px]">✈</span>}
                  </span>
                </div>
                {p.soldPrice != null && (
                  <span className="text-[10px] text-neon font-bold tabular-nums flex-shrink-0 ml-1">
                    {formatCroreAmount(p.soldPrice)} Cr
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const TeamRow = ({ team, isMyTeam, username, onPlayerClick, loadingId }) => {
  const [expanded, setExpanded] = useState(false);
  const remaining  = normalizeCroreAmount(team.remainingPurse ?? 0);
  const total      = normalizeCroreAmount(team.purse ?? 120);
  const spent      = normalizeCroreAmount(total - remaining);
  const pct        = total > 0 ? Math.max(2, (remaining / total) * 100) : 2;
  const playerCount= team.players?.length ?? 0;

  return (
    <div className={`border-b border-white/[0.04] last:border-b-0
                     ${isMyTeam ? 'border-l-2' : 'border-l-2 border-l-transparent'}`}
         style={isMyTeam ? { borderLeftColor: team.color } : {}}>

      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3
                   hover:bg-white/[0.03] transition text-left group">

        {/* Logo orb */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center
                        text-[10px] font-black flex-shrink-0 border border-white/[0.06]"
             style={{ background: (team.color || '#374151') + '28', color: team.color || '#9ca3af' }}>
          {team.shortName?.slice(0, 3) ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-bold text-white/80 truncate">{team.shortName}</span>
            {isMyTeam && (
              <span className="text-[8px] font-black tracking-widest text-neon
                               bg-neon/10 border border-neon/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
                YOU
              </span>
            )}
            {username && !isMyTeam && (
              <span className="text-[8px] text-white/25 truncate max-w-[60px]">{username}</span>
            )}
          </div>
          {/* Purse bar */}
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700 ease-out"
                 style={{ width: `${pct}%`, backgroundColor: team.color || '#374151' }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-white/25">{playerCount}/{team.maxPlayers ?? 25} players</span>
            <span className="text-[9px] text-white/25">₹{formatCroreAmount(spent)} spent</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold tabular-nums" style={{ color: team.color || '#fff' }}>
            {formatCroreAmount(remaining)}
          </p>
          <p className="text-[9px] text-white/25">Cr left</p>
        </div>

        <svg className={`w-3.5 h-3.5 text-white/20 flex-shrink-0 transition-transform duration-200
                         ${expanded ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/[0.04]">
          <SquadList players={team.players} onPlayerClick={onPlayerClick} loadingId={loadingId} />
        </div>
      )}
    </div>
  );
};

export default function OtherTeamsPanel({ teams, myTeamId, teamAssignments = {} }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingId,      setLoadingId]      = useState(null);
  const { room } = useRoom();

  const teamOwners = Object.values(teamAssignments).reduce((acc, a) => {
    if (a.teamId && a.claimedBy) acc[String(a.teamId)] = a.claimedBy;
    return acc;
  }, {});

  const openPlayer = async (playerId) => {
    if (loadingId) return;
    setLoadingId(String(playerId));
    try {
      const { data } = await api.get(`/players/${playerId}`, { params: room?.code ? { roomCode: room.code } : {} });
      setSelectedPlayer(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  if (!teams?.length) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-white/20 text-xs">No teams registered</p>
    </div>
  );

  const myTeam   = teams.find(t => String(t._id) === String(myTeamId));
  const others   = teams.filter(t => String(t._id) !== String(myTeamId))
                        .sort((a, b) => (b.remainingPurse ?? 0) - (a.remainingPurse ?? 0));
  const displayList = myTeam ? [myTeam, ...others] : others;

  return (
    <>
      {selectedPlayer && <PlayerStatsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
      <div className="flex flex-col h-full overflow-hidden">
        {displayList.map(team => (
          <TeamRow key={team._id} team={team}
            isMyTeam={String(team._id) === String(myTeamId)}
            username={teamOwners[String(team._id)]}
            onPlayerClick={openPlayer}
            loadingId={loadingId}
          />
        ))}
      </div>
    </>
  );
}
