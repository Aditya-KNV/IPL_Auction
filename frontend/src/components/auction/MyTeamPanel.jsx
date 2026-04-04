import React, { useState } from 'react';
import { formatCroreAmount, normalizeCroreAmount } from '../../utils/currency';
import PlayerStatsModal from '../players/PlayerStatsModal';

const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
const isOverseasPlayer = (player) => {
  const nat = String(player?.nationality || '').trim().toLowerCase();
  return nat.length > 0 && nat !== 'indian';
};

const ROLE_STYLE = {
  Batsman: { label: 'BAT', text: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  Bowler: { label: 'BWL', text: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30', dot: 'bg-red-500' },
  'All-Rounder': { label: 'AR', text: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30', dot: 'bg-purple-500' },
  'Wicket-Keeper': { label: 'WK', text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', dot: 'bg-amber-500' },
};

const PurseMeter = ({ team }) => {
  const remaining = normalizeCroreAmount(team.remainingPurse);
  const total = normalizeCroreAmount(team.purse);
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const spent = normalizeCroreAmount(total - remaining);

  const barColor =
    pct > 60 ? 'from-green-500 to-emerald-400' :
    pct > 30 ? 'from-amber-500 to-yellow-400' :
      'from-red-500 to-rose-400';

  return (
    <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/60">
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Remaining Purse</p>
          <p className="text-3xl font-black text-white tabular-nums mt-0.5">
            Rs {formatCroreAmount(remaining)}
            <span className="text-base text-gray-400 font-normal ml-1">Cr</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Spent</p>
          <p className="text-lg font-bold text-gray-300 tabular-nums">Rs {formatCroreAmount(spent)} Cr</p>
          <p className="text-xs text-gray-600">of Rs {formatCroreAmount(total)} Cr total</p>
        </div>
      </div>

      <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1.5 text-right">{pct.toFixed(1)}% remaining</p>
    </div>
  );
};

const PlayerRow = ({ player }) => {
  const style = ROLE_STYLE[player.role] ?? ROLE_STYLE.Batsman;

  return (
    <div 
      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-800/60 transition group cursor-pointer"
      onClick={() => player.onClick(player)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0 uppercase">
          {player.name?.[0] ?? '?'}
        </div>
        <span className="text-sm text-gray-200 font-medium truncate">
          {player.name}
          {isOverseasPlayer(player) && <span className="ml-1 text-sky-400">✈</span>}
        </span>
        {player.nationality && (
          <span className="hidden group-hover:inline text-xs text-gray-500 truncate flex-shrink-0">
            {player.nationality}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border}`}>
          {style.label}
        </span>
        {player.soldPrice != null && (
          <span className="text-xs font-semibold text-ipl-gold tabular-nums">
            Rs {formatCroreAmount(player.soldPrice)} Cr
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
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-1 py-1.5 group">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>{role}s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">{players.length}</span>
          <svg className={`w-3.5 h-3.5 text-gray-600 transition-transform ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && <div className="flex flex-col">{players.map((p) => <PlayerRow key={p._id} player={{...p, onClick: onPlayerClick}} />)}</div>}
    </div>
  );
};

export default function MyTeamPanel({ team, squadByRole }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const totalPlayers = team?.players?.length ?? 0;

  if (!team) {
    return (
      <div className="bg-gray-900/60 rounded-2xl p-5 border border-gray-800 flex flex-col items-center justify-center gap-2 py-10">
        <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
        </svg>
        <p className="text-gray-500 text-sm">You are not assigned to a team</p>
        <p className="text-gray-600 text-xs">Contact the auctioneer to get assigned</p>
      </div>
    );
  }

  return (
    <>
      {selectedPlayer && (
        <PlayerStatsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
      <div className="bg-gray-900/60 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderLeft: `4px solid ${team.color || '#004BA0'}` }}>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">My Team</p>
          <h2 className="text-xl font-black text-white mt-0.5">{team.name}</h2>
          <p className="text-sm text-gray-400 font-mono">{team.shortName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Squad</p>
          <p className="text-2xl font-bold text-white tabular-nums">{totalPlayers}</p>
          <p className="text-xs text-gray-600">of {team.maxPlayers} max</p>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-4">
        <PurseMeter team={team} />

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Squad</p>
          {totalPlayers === 0 ? (
            <p className="text-gray-600 text-sm px-1 py-3">No players bought yet</p>
          ) : (
            <div className="flex flex-col gap-1">
              {ROLE_ORDER.map((role) => (
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
