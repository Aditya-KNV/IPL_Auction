import React from 'react';
import { formatCroreAmount } from '../../utils/currency';

const ROLE_BADGE = {
  Batsman: { label: 'BAT', color: '#3b82f6' },
  Bowler: { label: 'BWL', color: '#ef4444' },
  'All-Rounder': { label: 'AR', color: '#a855f7' },
  'Wicket-Keeper': { label: 'WK', color: '#f59e0b' },
};

export default function PlayerCard({ player, currentBid, highlighted, compact }) {
  const role = ROLE_BADGE[player.role] ?? { label: '?', color: '#6b7280' };
  const isLive = highlighted && currentBid > 0;

  return (
    <div
      className={`rounded-xl overflow-hidden border transition-all ${
        highlighted ? 'border-ipl-gold/50 shadow-lg shadow-ipl-gold/10' : 'border-gray-800'
      } bg-gray-900`}
    >
      {highlighted && (
        <div className="h-0.5 bg-gradient-to-r from-transparent via-ipl-gold to-transparent" />
      )}

      <div className={`flex items-center gap-4 ${compact ? 'p-4' : 'p-5'}`}>
        <div
          className={`${compact ? 'w-14 h-14 text-xl' : 'w-16 h-16 text-2xl'} rounded-full bg-gray-800 border-2 flex-shrink-0 flex items-center justify-center font-bold text-white uppercase`}
          style={{ borderColor: `${role.color}66` }}
        >
          {player.imageUrl ? (
            <img src={player.imageUrl} alt={player.name} className="w-full h-full object-cover rounded-full" />
          ) : (
            player.name?.[0] ?? '?'
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {highlighted && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <h2 className={`font-bold text-white leading-tight truncate ${compact ? 'text-lg' : 'text-xl'}`}>
            {player.name}
          </h2>
          <p className="text-gray-500 text-xs mt-0.5 truncate">{player.nationality}</p>
          <span
            className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded border"
            style={{ color: role.color, borderColor: `${role.color}44`, backgroundColor: `${role.color}18` }}
          >
            {role.label} · {player.role}
          </span>
        </div>

        {highlighted && (
          <div className="text-right flex-shrink-0">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Base</p>
            <p className="text-gray-300 font-semibold text-sm tabular-nums">
              Rs {formatCroreAmount(player.basePrice)} Cr
            </p>
            {isLive && (
              <div className="mt-2">
                <p className="text-gray-500 text-[10px] uppercase tracking-wider">Bid</p>
                <p className="text-ipl-gold font-black text-xl tabular-nums leading-tight">
                  Rs {formatCroreAmount(currentBid)}
                  <span className="text-xs font-normal text-gray-400 ml-0.5">Cr</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
