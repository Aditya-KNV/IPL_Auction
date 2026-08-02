import React from 'react';
import { formatCroreAmount } from '../../utils/currency';

/**
 * Infinite-scroll horizontal ticker of recently sold players.
 * Receives `soldHistory` = array of { player, team, amount } from AuctionBoard.
 * Falls back to an empty strip when no sales have happened yet.
 */
export default function SoldTicker({ soldHistory = [] }) {
  if (!soldHistory.length) {
    return (
      <div className="glass-panel top-accent h-[40px] flex items-center overflow-hidden flex-shrink-0"
           style={{ '--accent': 'rgb(var(--gold-bright))', borderRadius: '18px' }}>
        <div className="flex-shrink-0 px-3 h-full flex items-center
                        bg-gradient-to-b from-neon to-neon-dim text-black text-[9px] font-black tracking-[2px] uppercase">
          RECENT SALES
        </div>
        <p className="text-white/20 text-[10px] px-4">No sales yet — auction in progress</p>
      </div>
    );
  }

  // The scrolling marquee only works as a seamless loop when the content is
  // duplicated (CSS animates 0% → -50%, i.e. exactly one copy's width, then
  // snaps back). With few entries that duplicate is short enough to still be
  // on screen at once, which reads as "the same sale shown twice" — so below
  // this threshold we just render the list once, statically, with no loop.
  const shouldLoop = soldHistory.length > 4;
  const items = shouldLoop ? [...soldHistory, ...soldHistory] : soldHistory;

  return (
    <div className="glass-panel top-accent h-[40px] flex items-center overflow-hidden flex-shrink-0"
         style={{ '--accent': 'rgb(var(--gold-bright))', borderRadius: '18px' }}>
      {/* Label tab */}
      <div className="flex-shrink-0 px-3 h-full flex items-center
                      bg-gradient-to-b from-neon to-neon-dim text-black text-[9px] font-black tracking-[2px] uppercase
                      z-10">
        RECENT SALES
      </div>

      {/* Scrolling track */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
        <div className={`flex items-center whitespace-nowrap ${shouldLoop ? 'animate-ticker-scroll' : ''}`}>
          {items.map((sale, i) => (
            <React.Fragment key={i}>
              <span className="inline-flex items-center gap-1.5 px-5 text-[11px] font-semibold">
                <span className="text-white tracking-wide">{sale.player?.name ?? '—'}</span>
                <span className="text-white/30">→</span>
                <span className="font-black tracking-wider"
                      style={{ color: sale.team?.color || '#ffffff' }}>
                  {sale.team?.shortName ?? '?'}
                </span>
                <span className="font-bebas text-[13px] text-neon tracking-wider">
                  [{formatCroreAmount(sale.amount)} CR]
                </span>
              </span>
              <span className="text-white/20 text-[8px] mx-1">◆</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
