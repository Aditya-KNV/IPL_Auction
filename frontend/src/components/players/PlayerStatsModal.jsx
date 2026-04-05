import React from 'react';
import { STATUS_COLOR, getDisplayStatus } from '../../utils/playerDisplay';

const StatBar = ({ label, value, max = 10, color = 'bg-ipl-gold' }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="tabular-nums font-semibold text-white">{value}<span className="text-gray-600">/{max}</span></span>
    </div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  </div>
);

export default function PlayerStatsModal({ player, onClose }) {
  const displayStatus = getDisplayStatus(player);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-800 bg-gray-900 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-white">{player.name}</h2>
              {player.tactical?.positions?.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {player.tactical.positions.map((pos) => (
                    <span
                      key={pos}
                      className="rounded-full border border-ipl-gold/40 bg-ipl-gold/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-ipl-gold"
                    >
                      #{pos}
                    </span>
                  ))}
                </div>
              )}
              {player.bowling?.positions?.some((v) => v === 1) && (
                <div className="flex items-center gap-1 flex-wrap">
                  {[['PP', 0], ['MID', 1], ['DEATH', 2]].map(([label, idx]) =>
                    player.bowling.positions[idx] === 1 ? (
                      <span
                        key={label}
                        className="rounded-full border border-red-400/40 bg-red-400/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400"
                      >
                        {label}
                      </span>
                    ) : null
                  )}
                </div>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {player.nationality} · {player.age} yrs · {player.batting_style === 'left-handed' ? 'Left-handed' : 'Right-handed'}
              {player.bowling_style ? ` · ${player.bowling_style}` : ''}
              {player.auctionSetName ? ` · ${player.auctionSetName}` : ''}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-300">{player.role}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[displayStatus] ?? 'text-gray-400'}`}>
                {displayStatus}
              </span>
              {player.team && (
                <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-ipl-gold">
                  {player.team.shortName ?? player.team.name}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-4 mt-1 flex-shrink-0 text-gray-500 hover:text-white">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Price */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Base Price</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-gray-200">₹{player.basePrice} Cr</p>
            </div>
            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-950/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Sold Price</p>
              <p className={`mt-0.5 text-lg font-black tabular-nums ${player.soldPrice ? 'text-ipl-gold' : 'text-gray-600'}`}>
                {player.soldPrice ? `₹${player.soldPrice} Cr` : '—'}
              </p>
            </div>
          </div>

          {/* Batting */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-400">Batting — Phases</p>
            <div className="space-y-3">
              <StatBar label="Powerplay" value={player.batting?.phases?.powerplay?.rating ?? 0} color="bg-blue-500" />
              <div className="flex justify-end text-[10px] text-gray-500 -mt-1.5">SR {player.batting?.phases?.powerplay?.strike_rate ?? 0}</div>
              <StatBar label="Middle Overs" value={player.batting?.phases?.middle?.rating ?? 0} color="bg-blue-500" />
              <div className="flex justify-end text-[10px] text-gray-500 -mt-1.5">SR {player.batting?.phases?.middle?.strike_rate ?? 0}</div>
              <StatBar label="Death Overs" value={player.batting?.phases?.death?.rating ?? 0} color="bg-blue-500" />
              <div className="flex justify-end text-[10px] text-gray-500 -mt-1.5">SR {player.batting?.phases?.death?.strike_rate ?? 0}</div>
            </div>
            <p className="mb-3 mt-4 text-xs font-bold uppercase tracking-wider text-blue-400">Batting — Skills</p>
            <div className="space-y-3">
              <StatBar label="Finishing" value={player.batting?.skills?.finishing ?? 0} color="bg-sky-500" />
              <StatBar label="Power Hitting" value={player.batting?.skills?.power_hitting ?? 0} color="bg-sky-500" />
              <StatBar label="Anchor" value={player.batting?.skills?.anchor ?? 0} color="bg-sky-500" />
              <StatBar label="Spin Play" value={player.batting?.skills?.spin_play ?? 0} color="bg-sky-500" />
              <StatBar label="Pace Play" value={player.batting?.skills?.pace_play ?? 0} color="bg-sky-500" />
            </div>
          </div>

          {/* Bowling */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-red-400">Bowling — Phases</p>
            <div className="space-y-3">
              <StatBar label="Powerplay" value={player.bowling?.phases?.powerplay ?? 0} color="bg-red-500" />
              <StatBar label="Middle Overs" value={player.bowling?.phases?.middle ?? 0} color="bg-red-500" />
              <StatBar label="Death Overs" value={player.bowling?.phases?.death ?? 0} color="bg-red-500" />
            </div>
            <p className="mb-3 mt-4 text-xs font-bold uppercase tracking-wider text-red-400">Bowling — Skills</p>
            <div className="space-y-3">
              <StatBar label="Variations" value={player.bowling?.skills?.variations ?? 0} color="bg-rose-500" />
              <StatBar label="Yorker" value={player.bowling?.skills?.yorker ?? 0} color="bg-rose-500" />
              <StatBar label="Bouncer" value={player.bowling?.skills?.bouncer ?? 0} color="bg-rose-500" />
            </div>
            <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
              <span className="text-gray-400">Overs quota: </span>
              <span className="font-semibold text-white">{player.tactical?.overs ?? 0} overs</span>
            </div>
            {player.bowling?.positions?.some((v) => v === 1) && (
              <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
                <span className="text-gray-400">Designated phases: </span>
                <span className="font-semibold text-white">
                  {[['Powerplay', 0], ['Middle', 1], ['Death', 2]]
                    .filter(([, idx]) => player.bowling.positions[idx] === 1)
                    .map(([label]) => label)
                    .join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Role Impact */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-400">Role Impact</p>
            <div className="space-y-3">
              <StatBar label="Match Winner" value={player.role_impact?.match_winner ?? 0} color="bg-amber-500" />
              <StatBar label="Clutch" value={player.role_impact?.clutch ?? 0} color="bg-amber-500" />
              <StatBar label="Consistency" value={player.role_impact?.consistency ?? 0} color="bg-amber-500" />
            </div>
          </div>

          {/* Fitness & Tactical */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-green-400">Fitness & Tactical</p>
            <div className="space-y-3">
              <StatBar label="Stamina" value={player.fitness?.stamina ?? 0} color="bg-green-500" />
              <StatBar label="Injury Risk (lower = better)" value={10 - (player.fitness?.injury_risk ?? 5)} color="bg-green-500" />
              <StatBar label="Tactical Flexibility" value={player.tactical?.flexibility ?? 0} color="bg-emerald-500" />
            </div>
            <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
              <span className="text-gray-400">Captaincy rating: </span>
              <span className="font-semibold text-white">{player.tactical?.captaincy ?? 0}</span>
              <span className="ml-2 text-[10px] text-gray-600">(0 – 1.25 scale)</span>
            </div>
            {player.tactical?.positions?.length > 0 && (
              <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
                <span className="text-gray-400">Preferred batting positions: </span>
                <span className="font-semibold text-white">{player.tactical.positions.join(', ')}</span>
              </div>
            )}
            {player.bowling?.positions?.some((v) => v === 1) && (
              <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm">
                <span className="text-gray-400">Bowling phases: </span>
                <span className="font-semibold text-white">
                  {[['Powerplay', 0], ['Middle', 1], ['Death', 2]]
                    .filter(([, idx]) => (player.bowling.positions[idx] ?? 0) === 1)
                    .map(([label]) => label)
                    .join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
