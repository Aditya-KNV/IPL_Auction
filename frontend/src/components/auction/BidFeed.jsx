import React, { useRef, useEffect } from 'react';
import { formatCroreAmount } from '../../utils/currency';

// Show at most 20 bids in the scrollable feed.
export default function BidFeed({ bids, currentPlayer }) {
  const containerRef = useRef(null);

  // Auto-scroll to top (newest bid) when bids update
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [bids.length]);

  if (!bids.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
        <svg className="w-7 h-7 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-white/20 text-xs">No bids yet</p>
      </div>
    );
  }

  return (
    <div ref={containerRef}
      className="flex flex-col gap-0 overflow-y-auto h-full custom-scrollbar">
      {bids.map((bid, i) => {
        const isTop  = i === 0;
        const team   = bid.team;
        const time   = new Date(bid.timestamp).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });

        return (
          <div key={i}
            className={`flex items-center gap-2.5 px-3.5 py-2.5
                        border-b border-white/[0.025] last:border-b-0
                        transition-colors
                        ${isTop ? 'animate-slide-left border-l-2 bg-neon/[0.04]' : 'hover:bg-white/[0.02]'}
                        ${isTop && i === 0 ? 'animate-bid-flash' : ''}`}
            style={isTop ? { borderLeftColor: team?.color || 'rgb(var(--neon))' } : { borderLeftColor: 'transparent', borderLeftWidth: '2px' }}>

            {/* Team orb */}
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                            text-[8px] font-black border border-white/[0.08]"
              style={{ background: (team?.color || '#6b7280') + '28', color: team?.color || '#9ca3af' }}>
              {team?.shortName?.slice(0, 3) ?? '?'}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight truncate"
                style={{ color: isTop ? (team?.color || 'rgb(var(--fg))') : 'rgb(var(--fg) / 0.55)' }}>
                {team?.shortName || team?.name || '—'}
              </p>
              <p className="text-[9px] text-white/25 mt-0.5 tabular-nums">{time}</p>
            </div>

            {/* Amount */}
            <div className="text-right flex-shrink-0">
              <p className={`font-bebas text-lg leading-none tabular-nums
                             ${isTop ? 'text-neon neon-glow' : 'text-white/40'}`}>
                {formatCroreAmount(bid.amount)}
              </p>
              <p className="text-[8px] text-white/20 tracking-wider">CR</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
