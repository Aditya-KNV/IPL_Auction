import React from 'react';
import { formatCroreAmount } from '../../utils/currency';

const ROLE_BADGE = {
  Batsman: { label: 'BAT', color: '#3b82f6' },
  Bowler: { label: 'BWL', color: '#ef4444' },
  'All-Rounder': { label: 'AR', color: '#a855f7' },
  'Wicket-Keeper': { label: 'WK', color: '#f59e0b' },
};

const PlayerSummary = ({ player, role, compact, highlighted, currentBid, isLive }) => (
  <div className={`flex items-center gap-4 ${compact ? 'p-4' : 'p-5'}`}>
    <div
      className={`${compact ? 'w-14 h-14 text-xl' : 'w-16 h-16 text-2xl'} rounded-full bg-gray-800 border-2 flex-shrink-0 flex items-center justify-center font-bold text-white uppercase`}
      style={{ borderColor: `${role.color}66` }}
    >
      {player.imageUrl ? (
        <img src={player.imageUrl} alt={player.name} className="h-full w-full rounded-full object-cover" />
      ) : (
        player.name?.[0] ?? '?'
      )}
    </div>

    <div className="flex-1 min-w-0">
      {highlighted && (
        <div className="mb-0.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 tracking-widest">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            LIVE
          </span>
        </div>
      )}
      <h2 className={`truncate font-bold leading-tight text-white ${compact ? 'text-lg' : 'text-xl'}`}>
        {player.name}
      </h2>
      <p className="mt-0.5 truncate text-xs text-gray-500">
        {[player.nationality, player.age ? `${player.age} yrs` : null].filter(Boolean).join(" · ")}
      </p>
      <span
        className="mt-1.5 inline-block rounded border px-2 py-0.5 text-[10px] font-bold"
        style={{ color: role.color, borderColor: `${role.color}44`, backgroundColor: `${role.color}18` }}
      >
        {role.label} · {player.role}
      </span>
    </div>

    {highlighted && (
      <div className="flex-shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">Base</p>
        <p className="text-sm font-semibold tabular-nums text-gray-300">
          Rs {formatCroreAmount(player.basePrice)} Cr
        </p>
        {isLive && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Bid</p>
            <p className="text-xl font-black leading-tight tabular-nums text-ipl-gold">
              Rs {formatCroreAmount(currentBid)}
              <span className="ml-0.5 text-xs font-normal text-gray-400">Cr</span>
            </p>
          </div>
        )}
      </div>
    )}
  </div>
);

export default function PlayerCard({ player, currentBid, highlighted, compact }) {
  const role = ROLE_BADGE[player.role] ?? { label: '?', color: '#6b7280' };
  const isLive = highlighted && currentBid > 0;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-gray-900 transition-all ${
        highlighted ? 'border-ipl-gold/50 shadow-lg shadow-ipl-gold/10' : 'border-gray-800'
      }`}
    >
      {highlighted && (
        <div className="h-0.5 bg-gradient-to-r from-transparent via-ipl-gold to-transparent" />
      )}

      <PlayerSummary
        player={player}
        role={role}
        compact={compact}
        highlighted={highlighted}
        currentBid={currentBid}
        isLive={isLive}
      />
    </div>
  );
}
