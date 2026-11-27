import React from 'react';
import { STATUS_COLOR, getDisplayStatus, hasBattingStats, hasBowlingStats } from '../../utils/playerDisplay';

const StatBar = ({ label, value, max = 10, color = 'rgb(var(--neon))' }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="text-white/40">{label}</span>
      <span className="tabular-nums font-semibold text-white">{value}<span className="text-white/20">/{max}</span></span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full transition-all duration-500"
           style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
    </div>
  </div>
);

const SectionTitle = ({ color, children, className = '' }) => (
  <p className={`text-[10px] font-black uppercase tracking-widest ${className}`} style={{ color }}>{children}</p>
);

const InfoBox = ({ children }) => (
  <div className="rounded-lg border border-white/[0.06] bg-surface-2/60 px-3 py-2 text-sm">
    {children}
  </div>
);

// The stats that matter when judging a player. Used by the popup and the
// auction side panel.
export function PlayerStatsDetails({ player }) {
  const showBatting = hasBattingStats(player.role);
  const showBowling = hasBowlingStats(player.role);
  const positions = player.tactical?.positions ?? [];

  return (
    <div className="space-y-5 px-5 py-4">
      {/* Price */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-xl border border-white/[0.06] bg-surface-2/60 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Base Price</p>
          <p className="mt-0.5 text-lg font-black tabular-nums text-white/70">₹{player.basePrice} Cr</p>
        </div>
        {player.soldPrice ? (
          <div className="flex-1 rounded-xl border border-white/[0.06] bg-surface-2/60 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Sold Price</p>
            <p className="mt-0.5 text-lg font-black tabular-nums text-neon">₹{player.soldPrice} Cr</p>
          </div>
        ) : null}
      </div>

      {/* Batting */}
      {showBatting && (
        <div>
          <SectionTitle color="#3b82f6" className="mb-3">Batting</SectionTitle>
          <div className="space-y-3">
            <StatBar label="Top Order"    value={player.batting?.phases?.powerplay?.rating ?? 0} color="#3b82f6" />
            <StatBar label="Middle Order" value={player.batting?.phases?.middle?.rating    ?? 0} color="#3b82f6" />
            <StatBar label="Lower Order"  value={player.batting?.phases?.death?.rating     ?? 0} color="#3b82f6" />
          </div>
          {positions.length > 0 && (
            <div className="mt-3">
              <InfoBox>
                <span className="text-white/40">Batting positions: </span>
                <span className="font-semibold text-white">{positions.join(', ')}</span>
              </InfoBox>
            </div>
          )}
        </div>
      )}

      {/* Bowling */}
      {showBowling && (
        <div>
          <SectionTitle color="#ef4444" className="mb-3">Bowling</SectionTitle>
          <div className="space-y-3">
            <StatBar label="Powerplay"    value={player.bowling?.phases?.powerplay ?? 0} color="#ef4444" />
            <StatBar label="Middle Overs" value={player.bowling?.phases?.middle    ?? 0} color="#ef4444" />
            <StatBar label="Death Overs"  value={player.bowling?.phases?.death     ?? 0} color="#ef4444" />
          </div>
          <div className="mt-3">
            <InfoBox>
              <span className="text-white/40">Overs: </span>
              <span className="font-semibold text-white">{player.tactical?.overs ?? 0}</span>
            </InfoBox>
          </div>
        </div>
      )}

      {/* Impact */}
      <div>
        <SectionTitle color="#f59e0b" className="mb-3">Impact</SectionTitle>
        <div className="space-y-3">
          <StatBar label="Match Winner" value={player.role_impact?.match_winner ?? 0} color="#f59e0b" />
          <StatBar label="Clutch"       value={player.role_impact?.clutch       ?? 0} color="#f59e0b" />
          <StatBar label="Consistency"  value={player.role_impact?.consistency  ?? 0} color="#f59e0b" />
        </div>
      </div>

      {/* Fitness & Tactical */}
      <div>
        <SectionTitle color="rgb(var(--neon))" className="mb-3">Fitness & Tactical</SectionTitle>
        <div className="space-y-3">
          <StatBar label="Stamina"                      value={player.fitness?.stamina ?? 0}     color="rgb(var(--neon))" />
          <StatBar label="Injury Risk (lower = better)" value={player.fitness?.injury_risk ?? 5} color="rgb(var(--bid-red))" />
          <StatBar label="Flexibility"                  value={player.tactical?.flexibility ?? 0} color="#10b981" />
        </div>
        <div className="mt-3">
          <InfoBox>
            <span className="text-white/40">Captaincy: </span>
            <span className="font-semibold text-white">{player.tactical?.captaincy ?? 0}</span>
          </InfoBox>
        </div>
      </div>
    </div>
  );
}

export default function PlayerStatsModal({ player, onClose }) {
  const displayStatus = getDisplayStatus(player);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-obsidian shadow-2xl custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/[0.06] bg-obsidian px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-white">{player.name}</h2>
            </div>
            <p className="mt-0.5 text-xs text-white/30">
              {player.nationality} · {player.age} yrs · {player.batting_style === 'left-handed' ? 'Left-handed' : 'Right-handed'}
              {player.bowling_style ? ` · ${player.bowling_style}` : ''}
              {player.auctionSetName ? ` · ${player.auctionSetName}` : ''}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/60">
                {player.role}
              </span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[displayStatus] ?? 'text-white/40'}`}>
                {displayStatus}
              </span>
              {player.team && (
                <span className="rounded border border-neon/25 bg-neon/[0.07] px-2 py-0.5 text-[10px] font-semibold text-neon">
                  {player.team.shortName ?? player.team.name}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 mt-1 flex-shrink-0 text-white/30 hover:text-white transition">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <PlayerStatsDetails player={player} />
      </div>
    </div>
  );
}
