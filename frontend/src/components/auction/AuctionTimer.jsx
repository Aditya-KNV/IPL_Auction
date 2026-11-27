import { useMemo } from 'react';

/**
 * Large digit countdown timer with red-bloom critical state.
 * Replaces the old SVG ring — matches the new bento-grid controls bar.
 */
export default function AuctionTimer({ timeLeft, totalDuration = 30, active }) {
  const pct     = totalDuration > 0 ? Math.min(1, Math.max(0, timeLeft / totalDuration)) : 0;
  const display = String(Math.min(timeLeft, 99)).padStart(2, '0');

  const state = useMemo(() => {
    if (!active || timeLeft === 0) return 'idle';
    if (pct <= 0.17) return 'critical';   // ≤ 5 s of 30 s  (red bloom)
    if (pct <= 0.33) return 'warning';    // ≤ 10 s (orange)
    return 'ok';
  }, [active, pct, timeLeft]);

  const barPct = Math.max(0, pct * 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[8px] font-black tracking-[2px] text-white/25 uppercase">Time Left</p>

      <div className={`font-bebas leading-none tabular-nums transition-all select-none
        ${state === 'critical' ? 'text-bid-red text-5xl animate-crit-pulse red-bloom'
          : state === 'warning' ? 'text-orange-400 text-5xl'
          : state === 'ok'     ? 'text-white text-5xl'
          : 'text-white/25 text-5xl'}`}>
        {display}
      </div>

      {/* thin bar under the digits */}
      <div className="w-14 h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000 linear"
          style={{
            width: `${barPct}%`,
            background: state === 'critical' ? 'rgb(var(--bid-red))'
                      : state === 'warning'  ? '#FF8C00'
                      : 'rgb(var(--neon))',
          }}
        />
      </div>

      <p className={`text-[9px] font-bold tracking-[1.5px] uppercase transition-colors
        ${state === 'critical' ? 'text-bid-red animate-pulse'
          : state === 'warning'  ? 'text-orange-400'
          : state === 'ok'       ? 'text-white/40'
          : 'text-white/20'}`}>
        {state === 'idle'     ? 'WAITING'
         : timeLeft === 0     ? 'TIME UP'
         : state === 'critical' ? 'CLOSING!'
         : 'LIVE'}
      </p>
    </div>
  );
}
