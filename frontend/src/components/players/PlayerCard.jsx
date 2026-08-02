import React from 'react';
import { formatCroreAmount } from '../../utils/currency';

const ROLE_CONFIG = {
  Batsman:         { label: 'BAT', color: '#3b82f6' },
  Bowler:          { label: 'BWL', color: '#ef4444' },
  'All-Rounder':   { label: 'AR',  color: '#a855f7' },
  'Wicket-Keeper': { label: 'WK',  color: '#f59e0b' },
};

const InjuryTag = ({ risk }) => {
  if (risk === undefined || risk === null) return null;
  if (risk < 4) return null; // only show if notable
  const cfg = risk >= 8
    ? { text: 'High Risk', color: 'rgb(var(--bid-red))', bg: 'rgb(var(--bid-red) / 0.08)',  border: 'rgb(var(--bid-red) / 0.22)'  }
    : risk >= 6
    ? { text: 'Med Risk',  color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.22)' }
    : { text: 'Low Risk',  color: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.22)'  };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {cfg.text}
    </span>
  );
};

export default function PlayerCard({ player, currentBid, highlighted, compact, onViewStats }) {
  const role       = ROLE_CONFIG[player.role] ?? { label: '?', color: '#6b7280' };
  const isLive     = highlighted && currentBid > 0;
  const injuryRisk = player.fitness?.injury_risk ?? 0;
  const captaincy  = player.tactical?.captaincy ?? 0;
  const auctionSet = player.auctionSetName;

  return (
    <div
      onClick={onViewStats ?? undefined}
      className={`relative overflow-hidden rounded-2xl transition-all duration-200
        ${onViewStats ? 'cursor-pointer' : ''}`}
      style={{
        border: highlighted
          ? `1px solid rgb(var(--fg) / 0.10)`
          : '1px solid rgb(var(--fg) / 0.06)',
        background: 'rgb(var(--surface))',
        backgroundImage: 'linear-gradient(to bottom, rgb(var(--fg) / 0.022) 0%, transparent 55%)',
        boxShadow: highlighted
          ? `inset 0 1px 0 rgb(var(--fg) / 0.06), 0 4px 20px ${role.color}15, 0 2px 8px rgb(var(--shadow) / 0.3)`
          : 'inset 0 1px 0 rgb(var(--fg) / 0.04), 0 2px 8px rgb(var(--shadow) / 0.25)',
        ...(onViewStats ? {
          transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
        } : {}),
      }}
      onMouseEnter={onViewStats ? (e) => {
        e.currentTarget.style.borderColor = 'rgb(var(--fg) / 0.12)';
        e.currentTarget.style.transform   = 'translateY(-2px)';
        e.currentTarget.style.boxShadow   = `inset 0 1px 0 rgb(var(--fg) / 0.07), 0 8px 24px rgb(var(--shadow) / 0.4)`;
      } : undefined}
      onMouseLeave={onViewStats ? (e) => {
        e.currentTarget.style.borderColor = highlighted ? 'rgb(var(--fg) / 0.10)' : 'rgb(var(--fg) / 0.06)';
        e.currentTarget.style.transform   = 'translateY(0)';
        e.currentTarget.style.boxShadow   = highlighted
          ? `inset 0 1px 0 rgb(var(--fg) / 0.06), 0 4px 20px ${role.color}15, 0 2px 8px rgb(var(--shadow) / 0.3)`
          : 'inset 0 1px 0 rgb(var(--fg) / 0.04), 0 2px 8px rgb(var(--shadow) / 0.25)';
      } : undefined}
    >
      {/* Role-colored top stripe */}
      <div className="absolute top-0 inset-x-0 h-px"
           style={{ background: `linear-gradient(90deg, transparent, ${role.color}60, transparent)`, opacity: highlighted ? 1 : 0.5 }} />

      {/* Main content */}
      <div className={`flex items-center gap-3.5 ${compact ? 'p-3.5' : 'p-4'}`}>

        {/* Avatar — role gradient bg + initial or image */}
        <div
          className={`${compact ? 'w-11 h-11' : 'w-12 h-12'} rounded-xl flex-shrink-0 overflow-hidden relative`}
          style={{ background: `linear-gradient(135deg, ${role.color}28 0%, ${role.color}0C 100%)`, border: `1px solid ${role.color}25` }}
        >
          {player.imageUrl ? (
            <img src={player.imageUrl} alt={player.name} className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-bold text-base"
                 style={{ color: role.color }}>
              {player.name?.[0] ?? '?'}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Live indicator */}
          {highlighted && (
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-bid-red animate-pulse flex-shrink-0" />
              <span className="text-[10px] font-semibold text-bid-red/80 tracking-wide">Live</span>
            </div>
          )}

          {/* Name */}
          <h2 className={`font-semibold text-white leading-tight truncate ${compact ? 'text-[14px]' : 'text-[15px]'}`}>
            {player.name}
          </h2>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Role badge */}
            <span className="text-[11px] font-semibold rounded-md px-1.5 py-0.5 leading-none"
                  style={{ color: role.color, background: role.color + '15' }}>
              {role.label}
            </span>
            {player.nationality && (
              <span className="text-[11px] text-white/30">{player.nationality}</span>
            )}
            {player.age && (
              <span className="text-[11px] text-white/20">{player.age}y</span>
            )}
            {highlighted && injuryRisk >= 4 && <InjuryTag risk={injuryRisk} />}
          </div>
        </div>

        {/* Price block */}
        <div className="flex-shrink-0 text-right min-w-[52px]">
          {isLive ? (
            <>
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/25 mb-0.5">Bid</p>
              <p className="font-bebas text-[28px] leading-none tabular-nums text-neon neon-glow">
                {formatCroreAmount(currentBid)}
                <span className="text-[11px] font-sans font-normal text-neon/40 ml-0.5">Cr</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/25 mb-0.5">Base</p>
              <p className="text-[13px] font-semibold text-white/45 tabular-nums">
                ₹{formatCroreAmount(player.basePrice)} Cr
              </p>
            </>
          )}
        </div>
      </div>

      {/* Footer — only render if there's something meaningful to show */}
      {(auctionSet || captaincy > 0 || onViewStats) && (
        <div className="flex items-center gap-2 px-4 pb-3 pt-0"
             style={{ borderTop: '1px solid rgb(var(--fg) / 0.04)' }}>
          {auctionSet && (
            <span className="text-[10px] font-medium rounded-full px-2 py-0.5"
                  style={{ color: 'rgb(var(--gold-bright) / 0.85)', background: 'rgb(var(--gold-bright) / 0.06)', border: '1px solid rgb(var(--gold-bright) / 0.15)' }}>
              {auctionSet}
            </span>
          )}
          {captaincy > 0 && (
            <span className="text-[10px] font-medium rounded-full px-2 py-0.5"
                  style={{ color: 'rgba(45,212,191,0.7)', background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.15)' }}>
              C {captaincy}
            </span>
          )}
          {onViewStats && (
            <div className="ml-auto flex items-center gap-1 text-[10px] text-white/20">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              Stats
            </div>
          )}
        </div>
      )}
    </div>
  );
}
