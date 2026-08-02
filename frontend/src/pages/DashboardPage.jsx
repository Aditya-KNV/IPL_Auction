import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';

const STATUS_CFG = {
  waiting:   { label: 'Waiting',   color: 'rgba(255,255,255,0.3)', dot: 'bg-white/30'  },
  ongoing:   { label: 'Live',      color: '#00FF66',              dot: 'bg-neon animate-live-blink' },
  completed: { label: 'Completed', color: '#FFD060',              dot: 'bg-gold-bright' },
  paused:    { label: 'Paused',    color: '#f97316',              dot: 'bg-orange-400' },
};

const StatusPill = ({ status }) => {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.waiting;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
         style={{ borderColor: cfg.color + '30', background: cfg.color + '0E' }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className="text-[12px] font-semibold" style={{ color: cfg.color }}>
        Auction {cfg.label}
      </span>
    </div>
  );
};

const MetricCell = ({ label, value, sub, accent, borderRight }) => (
  <div className="relative px-6 py-5 group overflow-hidden"
       style={borderRight ? { borderRight: '1px solid rgba(255,255,255,0.055)' } : {}}>
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
         style={{ background: `radial-gradient(circle at 0% 0%, ${accent}0E 0%, transparent 65%)` }} />
    <div className="relative">
      <p className="label mb-3">{label}</p>
      <p className="font-bebas text-[46px] text-white leading-none tracking-wider tabular-nums">
        {value ?? <span className="text-white/20">—</span>}
      </p>
      <p className="text-[11px] text-white/25 mt-1">{sub}</p>
    </div>
  </div>
);

const ArrowRight = () => (
  <svg className="w-4 h-4 flex-shrink-0 text-white/20 group-hover:text-white/50 transition-all duration-200 group-hover:translate-x-0.5"
       fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
  </svg>
);

export default function DashboardPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [playersRes, teamsRes, sessionRes] = await Promise.all([
        api.get('/players'),
        api.get('/teams'),
        api.get('/auction/session'),
      ]);
      setStats({
        totalPlayers:     playersRes.data.length,
        soldPlayers:      playersRes.data.filter(p => p.status === 'sold').length,
        unsoldPlayers:    playersRes.data.filter(p => p.status === 'unsold').length,
        availablePlayers: playersRes.data.filter(p => p.status === 'available').length,
        totalTeams:       teamsRes.data.length,
        auctionStatus:    sessionRes.data?.status || 'waiting',
      });
    };
    load().catch(console.error);
  }, []);

  const soldPct      = stats ? Math.round((stats.soldPlayers / (stats.totalPlayers || 1)) * 100) : 0;
  const processedPct = stats ? Math.round(((stats.soldPlayers + stats.unsoldPlayers) / (stats.totalPlayers || 1)) * 100) : 0;

  const metrics = [
    { label: 'Total Players', value: stats?.totalPlayers,  sub: 'in the pool',       accent: '#3b82f6' },
    { label: 'Sold',          value: stats?.soldPlayers,   sub: `${soldPct}% of pool`, accent: '#00FF66' },
    { label: 'Unsold',        value: stats?.unsoldPlayers, sub: 'passed or no bid',  accent: '#FF3355' },
    { label: 'Teams',         value: stats?.totalTeams,    sub: 'in this auction',   accent: '#f59e0b' },
  ];

  const actions = [
    {
      to: '/room', label: 'Auction Room', sub: 'Join or create a bidding session',
      accent: '#00FF66', bg: 'rgba(0,255,102,0.07)', border: 'rgba(0,255,102,0.14)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      ),
    },
    {
      to: '/ranking', label: 'Team Rankings', sub: 'Scores, squads & analytics',
      accent: '#FFD060', bg: 'rgba(255,208,96,0.07)', border: 'rgba(255,208,96,0.13)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      ),
    },
    {
      to: '/players', label: 'Player Database', sub: 'Browse stats & filter by phase',
      accent: '#3b82f6', bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.14)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
      ),
    },
    {
      to: '/teams', label: 'All Teams', sub: 'Purse, rosters & standings',
      accent: '#a855f7', bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.13)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen pt-[57px]">
      <div className="max-w-4xl mx-auto px-5 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="label mb-2">IPL Auction 2025</p>
            <h1 className="text-[24px] font-bold text-white tracking-tight">Overview</h1>
          </div>
          <StatusPill status={stats?.auctionStatus} />
        </div>

        {/* Connected metrics strip */}
        <div className="card overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {metrics.map((m, i) => (
              <MetricCell key={m.label} {...m} borderRight={i < metrics.length - 1} />
            ))}
          </div>
        </div>

        {/* Auction progress */}
        {stats && stats.totalPlayers > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-medium text-white/50">Auction Progress</p>
              <p className="text-[12px] text-white/25 tabular-nums">
                {stats.soldPlayers + stats.unsoldPlayers} / {stats.totalPlayers}
              </p>
            </div>
            {/* Track with layered fill */}
            <div className="relative h-1 rounded-full overflow-hidden"
                 style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="absolute inset-y-0 left-0 h-full rounded-full transition-all duration-700"
                   style={{ width: `${processedPct}%`, background: 'rgba(255,51,85,0.35)' }} />
              <div className="absolute inset-y-0 left-0 h-full rounded-full transition-all duration-700"
                   style={{ width: `${soldPct}%`, background: 'linear-gradient(90deg, #00CC52, #00FF66)' }} />
            </div>
            <div className="flex items-center gap-5 mt-3">
              <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                <span className="w-1.5 h-1.5 rounded-full bg-neon flex-shrink-0" />
                {stats.soldPlayers} sold
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                <span className="w-1.5 h-1.5 rounded-full bg-bid-red/50 flex-shrink-0" />
                {stats.unsoldPlayers} unsold
              </span>
              <span className="ml-auto text-[11px] text-white/20">{stats.availablePlayers} remaining</span>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map(({ to, label, sub, accent, bg, border, icon }) => (
            <Link key={to} to={to}
              className="card-lift group flex items-center gap-4 p-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                   style={{ background: bg, border: `1px solid ${border}`, color: accent }}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white leading-snug">{label}</p>
                <p className="text-[12px] text-white/30 mt-0.5">{sub}</p>
              </div>
              <ArrowRight />
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
