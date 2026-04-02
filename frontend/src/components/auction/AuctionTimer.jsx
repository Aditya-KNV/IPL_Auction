import React, { useMemo } from 'react';

const SIZE      = 120;
const STROKE    = 8;
const RADIUS    = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * SVG circular countdown ring.
 * @param {number}  timeLeft      - seconds remaining
 * @param {number}  totalDuration - full timer duration (for % calculation)
 * @param {boolean} active        - whether to show pulsing ring
 */
export default function AuctionTimer({ timeLeft, totalDuration = 30, active }) {
  const pct      = totalDuration > 0 ? Math.max(0, timeLeft / totalDuration) : 0;
  const offset   = CIRCUMFERENCE * (1 - pct);

  const ringColor = useMemo(() => {
    if (!active || timeLeft === 0) return '#4B5563';  // gray-600
    if (pct > 0.5) return '#22c55e';                  // green
    if (pct > 0.25) return '#f59e0b';                 // amber
    return '#ef4444';                                  // red
  }, [active, pct, timeLeft]);

  const textColor = useMemo(() => {
    if (!active || timeLeft === 0) return 'text-gray-500';
    if (pct > 0.5) return 'text-green-400';
    if (pct > 0.25) return 'text-amber-400';
    return 'text-red-400';
  }, [active, pct, timeLeft]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* Background track */}
        <svg width={SIZE} height={SIZE} className="rotate-[-90deg]">
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none" stroke="#1f2937" strokeWidth={STROKE}
          />
          {/* Progress arc */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
          />
        </svg>

        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${textColor} ${active && timeLeft <= 10 && timeLeft > 0 ? 'animate-pulse' : ''}`}>
            {timeLeft}
          </span>
          <span className="text-xs text-gray-500 mt-0.5">sec</span>
        </div>
      </div>

      <span className={`text-xs font-semibold mt-1 ${
        !active || timeLeft === 0 ? 'text-gray-600'
        : timeLeft <= 10 ? 'text-red-400 animate-pulse'
        : 'text-gray-400'
      }`}>
        {!active ? 'WAITING'
         : timeLeft === 0 ? 'TIME UP'
         : timeLeft <= 10 ? 'CLOSING!'
         : 'LIVE'}
      </span>
    </div>
  );
}
