import React from 'react';
import { formatCroreAmount } from '../../utils/currency';

export default function BidFeed({ bids }) {
  if (!bids.length) {
    return (
      <div className="text-center py-4 text-gray-600 text-sm">
        No bids yet - be the first
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
      {bids.map((bid, i) => {
        const isTop = i === 0;
        const team = bid.team;
        const time = new Date(bid.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        return (
          <div
            key={i}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              isTop ? 'bg-ipl-gold/8 border border-ipl-gold/20' : 'border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: team?.color || '#6b7280' }}
              />
              <span className={`font-semibold ${isTop ? 'text-white' : 'text-gray-400'}`}>
                {team?.shortName || team?.name || '-'}
              </span>
              {isTop && (
                <span className="text-[9px] font-bold text-ipl-gold border border-ipl-gold/30 px-1.5 py-0.5 rounded-full tracking-widest">
                  TOP
                </span>
              )}
            </div>

            <div className="text-right">
              <span className={`font-bold tabular-nums ${isTop ? 'text-ipl-gold' : 'text-gray-300'}`}>
                Rs {formatCroreAmount(bid.amount)} Cr
              </span>
              <span className="block text-gray-600 text-[10px] tabular-nums">{time}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
