import React from 'react';
import { formatCroreAmount } from '../../utils/currency';

const ROLE_BADGE = {
  Batsman: { label: 'BAT', color: '#3b82f6' },
  Bowler: { label: 'BWL', color: '#ef4444' },
  'All-Rounder': { label: 'AR', color: '#a855f7' },
  'Wicket-Keeper': { label: 'WK', color: '#f59e0b' },
};

const PlayerSummary = ({ player, role, compact, highlighted, currentBid, isLive, injuryRisk }) => (
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
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span
          className="inline-block rounded border px-2 py-0.5 text-[10px] font-bold"
          style={{ color: role.color, borderColor: `${role.color}44`, backgroundColor: `${role.color}18` }}
        >
          {role.label} · {player.role}
        </span>
        {highlighted && (
          <span className={`inline-flex items-center gap-0.5 rounded border px-2 py-0.5 text-[10px] font-bold ${
            injuryRisk >= 8 ? 'bg-red-500/20 text-red-400 border-red-500/30' :
            injuryRisk >= 6 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
            injuryRisk >= 4 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                              'bg-green-500/20 text-green-400 border-green-500/30'
          }`}>
            {injuryRisk >= 8 ? '🔴' : injuryRisk >= 6 ? '🟠' : injuryRisk >= 4 ? '🟡' : '🟢'} Risk {injuryRisk}/10
          </span>
        )}
      </div>
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

export default function PlayerCard({ player, currentBid, highlighted, compact, onViewStats }) {
  const role = ROLE_BADGE[player.role] ?? { label: '?', color: '#6b7280' };
  const isLive = highlighted && currentBid > 0;
  const positions = Array.isArray(player.tactical?.positions) && player.tactical.positions.length
    ? player.tactical.positions.join(', ')
    : null;
  const bowlingPhases = Array.isArray(player.bowling?.positions)
    ? [['PP', 0], ['MID', 1], ['DEATH', 2]].filter(([, i]) => player.bowling.positions[i] === 1).map(([l]) => l)
    : [];

  const captaincy = player.tactical?.captaincy ?? 0;
  const injuryRisk = player.fitness?.injury_risk ?? 0;
  const hasFooter = player.auctionSetName || positions || bowlingPhases.length > 0 || captaincy > 0 || onViewStats;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-gray-900 transition-all ${
        highlighted ? 'border-ipl-gold/50 shadow-lg shadow-ipl-gold/10' : 'border-gray-800'
      } ${onViewStats ? 'cursor-pointer hover:border-ipl-gold/30 hover:bg-gray-900/80' : ''}`}
      onClick={onViewStats ?? undefined}
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
        injuryRisk={injuryRisk}
      />

      {hasFooter && (
        <div className="flex items-center gap-2 flex-wrap px-4 pb-3 border-t border-gray-800/60 pt-2.5">
          {player.auctionSetName && (
            <span className="inline-flex items-center rounded-full border border-ipl-gold/30 bg-ipl-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ipl-gold">
              {player.auctionSetName}
            </span>
          )}
          {positions && (
            <span className="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-0.5 text-[10px] font-medium text-gray-400">
              Bat: {positions}
            </span>
          )}
          {captaincy > 0 && (
            <span className="inline-flex items-center rounded-full border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-[10px] font-bold text-teal-400">
              C {captaincy}
            </span>
          )}
          {bowlingPhases.map((phase) => (
            <span
              key={phase}
              className="inline-flex items-center rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold text-red-400"
            >
              {phase}
            </span>
          ))}
          {onViewStats && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              tap to view stats
            </span>
          )}
        </div>
      )}
    </div>
  );
}
