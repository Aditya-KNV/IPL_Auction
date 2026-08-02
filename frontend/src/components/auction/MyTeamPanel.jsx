import React, { useState } from 'react';
import { formatCroreAmount, normalizeCroreAmount } from '../../utils/currency';
import PlayerStatsModal from '../players/PlayerStatsModal';

const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
const isOverseasPlayer = (player) => {
  const nat = String(player?.nationality || '').trim().toLowerCase();
  return nat.length > 0 && nat !== 'indian';
};

const ROLE_STYLE = {
  Batsman:        { label: 'BAT', color: '#3b82f6', dot: 'bg-blue-500' },
  Bowler:         { label: 'BWL', color: '#ef4444', dot: 'bg-red-500' },
  'All-Rounder':  { label: 'AR',  color: '#a855f7', dot: 'bg-purple-500' },
  'Wicket-Keeper':{ label: 'WK',  color: '#f59e0b', dot: 'bg-amber-500' },
};

const PurseMeter = ({ team }) => {
  const remaining = normalizeCroreAmount(team.remainingPurse);
  const total     = normalizeCroreAmount(team.purse);
  const pct       = total > 0 ? (remaining / total) * 100 : 0;
  const spent     = normalizeCroreAmount(total - remaining);
  const barColor  = pct > 60 ? '#00FF66' : pct > 30 ? '#f59e0b' : '#FF3355';

  return (
    <div className="rounded-xl border border-white/[0.08] bg-surface-2/60 p-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Remaining Purse</p>
          <p className="font-bebas text-3xl text-white tabular-nums mt-0.5 tracking-wider">
            {formatCroreAmount(remaining)}
            <span className="text-base text-white/40 font-sans font-normal ml-1">Cr</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/30">Spent</p>
          <p className="text-base font-bold text-white/60 tabular-nums">{formatCroreAmount(spent)} Cr</p>
          <p className="text-[10px] text-white/20">of {formatCroreAmount(total)} Cr total</p>
        </div>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${Math.max(2, pct)}%`, backgroundColor: barColor }} />
      </div>
      <p className="text-[10px] text-white/20 mt-1.5 text-right">{pct.toFixed(1)}% remaining</p>
    </div>
  );
};

const PlayerRow = ({ player, onClick }) => {
  const style = ROLE_STYLE[player.role] ?? ROLE_STYLE.Batsman;
  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.05] transition cursor-pointer"
      onClick={() => onClick(player)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 uppercase border"
             style={{ background: style.color + '18', color: style.color, borderColor: style.color + '44' }}>
          {player.name?.[0] ?? '?'}
        </div>
        <span className="text-sm text-white/70 font-medium truncate">
          {player.name}
          {isOverseasPlayer(player) && <span className="ml-1 text-sky-400">✈</span>}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
              style={{ color: style.color, borderColor: style.color + '44', backgroundColor: style.color + '18' }}>
          {style.label}
        </span>
        {player.soldPrice != null && (
          <span className="text-[10px] font-semibold text-neon tabular-nums">
            {formatCroreAmount(player.soldPrice)} Cr
          </span>
        )}
      </div>
    </div>
  );
};

const RoleSection = ({ role, players, onPlayerClick }) => {
  const [open, setOpen] = useState(true);
  const style = ROLE_STYLE[role] ?? ROLE_STYLE.Batsman;
  if (!players?.length) return null;

  return (
    <div>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-1 py-1.5">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: style.color }}>{role}s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30 bg-white/[0.05] px-1.5 py-0.5 rounded-full">{players.length}</span>
          <svg className={`w-3 h-3 text-white/20 transition-transform ${open ? '' : '-rotate-90'}`}
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="flex flex-col">
          {players.map(p => <PlayerRow key={p._id} player={p} onClick={onPlayerClick} />)}
        </div>
      )}
    </div>
  );
};

export default function MyTeamPanel({ team, squadByRole }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const totalPlayers = team?.players?.length ?? 0;

  if (!team) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-surface/60 flex flex-col items-center justify-center gap-2 p-10">
        <svg className="w-10 h-10 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
        </svg>
        <p className="text-white/30 text-sm">You are not assigned to a team</p>
        <p className="text-white/15 text-xs">Contact the auctioneer to get assigned</p>
      </div>
    );
  }

  return (
    <>
      {selectedPlayer && <PlayerStatsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
      <div className="rounded-2xl border border-white/[0.06] bg-surface/60 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-l-2"
             style={{ borderLeftColor: team.color || '#00FF66' }}>
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">My Team</p>
            <h2 className="text-xl font-black text-white mt-0.5">{team.name}</h2>
            <p className="text-xs text-white/40 font-mono">{team.shortName}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/30">Squad</p>
            <p className="font-bebas text-3xl text-white tabular-nums tracking-wider">{totalPlayers}</p>
            <p className="text-[10px] text-white/20">of {team.maxPlayers} max</p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4 space-y-4 border-t border-white/[0.04]">
          <PurseMeter team={team} />
          <div>
            <p className="text-[10px] font-black text-white/25 uppercase tracking-widest mb-2 px-1">Squad</p>
            {totalPlayers === 0 ? (
              <p className="text-white/25 text-xs px-1 py-3">No players bought yet</p>
            ) : (
              <div className="flex flex-col gap-1">
                {ROLE_ORDER.map(role => (
                  <RoleSection key={role} role={role} players={squadByRole[role]} onPlayerClick={setSelectedPlayer} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
