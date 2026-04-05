import React, { useState } from 'react';
import { formatCroreAmount, normalizeCroreAmount } from '../../utils/currency';
import PlayerStatsModal from '../players/PlayerStatsModal';
import api from '../../services/api';

const ROLE_COLOR = {
  Batsman: '#3b82f6',
  Bowler: '#ef4444',
  'All-Rounder': '#a855f7',
  'Wicket-Keeper': '#f59e0b',
};

const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
const isOverseasPlayer = (player) => {
  const nat = String(player?.nationality || '').trim().toLowerCase();
  return nat.length > 0 && nat !== 'indian';
};

const PurseBar = ({ remaining, total, color }) => {
  const pct = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color || '#004BA0' }} />
      </div>
      <span className="text-[10px] text-gray-600 tabular-nums w-7 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
    </div>
  );
};

const SquadList = ({ players, onPlayerClick, loadingId }) => {
  if (!players || players.length === 0) {
    return <p className="text-gray-600 text-xs text-center py-3">No players bought yet</p>;
  }

  const byRole = players.reduce((acc, p) => {
    const key = p.role || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const orderedRoles = [
    ...ROLE_ORDER.filter((r) => byRole[r]?.length),
    ...Object.keys(byRole).filter((r) => !ROLE_ORDER.includes(r) && byRole[r]?.length),
  ];

  return (
    <div className="flex flex-col gap-3 pt-1">
      {orderedRoles.map((role) => (
        <div key={role}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1 px-1" style={{ color: ROLE_COLOR[role] || '#6b7280' }}>
            {role}s ({byRole[role].length})
          </p>
          <div className="flex flex-col gap-0.5">
            {byRole[role].map((p) => {
              const isLoading = loadingId === String(p._id);
              return (
                <button
                  key={p._id}
                  onClick={() => onPlayerClick(p._id)}
                  disabled={!!loadingId}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-700/60 transition text-left w-full cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ROLE_COLOR[p.role] || '#6b7280' }} />
                    <span className="text-sm text-gray-200 truncate">
                      {p.name}
                      {isOverseasPlayer(p) && <span className="ml-1 text-sky-400">✈</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {p.soldPrice != null && (
                      <span className="text-xs text-ipl-gold font-semibold tabular-nums">
                        Rs {formatCroreAmount(p.soldPrice)} Cr
                      </span>
                    )}
                    {isLoading ? (
                      <svg className="w-3 h-3 animate-spin text-ipl-gold" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const TeamRow = ({ team, rank, isMyTeam, onPlayerClick, loadingId }) => {
  const [expanded, setExpanded] = useState(false);
  const remaining = normalizeCroreAmount(team.remainingPurse ?? 0);
  const total = normalizeCroreAmount(team.purse ?? 0);
  const spent = normalizeCroreAmount(total - remaining);
  const playerCount = team.players?.length ?? 0;

  return (
    <div className={`border-b border-gray-800/60 last:border-b-0 ${isMyTeam ? 'bg-ipl-blue/5' : ''}`}>
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/30 transition text-left">
        <span className="text-xs text-gray-600 font-mono w-4 flex-shrink-0">{isMyTeam ? '★' : rank}</span>

        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black text-white flex-shrink-0" style={{ backgroundColor: team.color || '#374151' }}>
          {team.shortName?.slice(0, 2) ?? '??'}
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200 truncate">{team.name}</span>
            {isMyTeam && (
              <span className="text-[9px] font-bold text-ipl-gold border border-ipl-gold/30 px-1.5 py-0.5 rounded-full tracking-widest flex-shrink-0">
                YOU
              </span>
            )}
          </div>
          <PurseBar remaining={remaining} total={total || 120} color={team.color} />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-gray-600">
              Spent: <span className="text-gray-400">Rs {formatCroreAmount(spent)} Cr</span>
            </span>
            <span className="text-[10px] text-gray-600">
              <span className="text-gray-400 font-medium">{playerCount}</span> / {team.maxPlayers ?? 25} players
            </span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <span className="text-sm font-bold text-white tabular-nums">Rs {formatCroreAmount(remaining)}</span>
          <span className="text-[10px] text-gray-500 ml-0.5">Cr</span>
        </div>

        <svg className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800/40">
          <div className="h-0.5 w-12 rounded-full mb-3 mt-3" style={{ backgroundColor: team.color || '#374151' }} />
          <SquadList players={team.players} onPlayerClick={onPlayerClick} loadingId={loadingId} />
        </div>
      )}
    </div>
  );
};

export default function OtherTeamsPanel({ teams, myTeamId }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  const openPlayer = async (playerId) => {
    if (loadingId) return;
    setLoadingId(String(playerId));
    try {
      const { data } = await api.get(`/players/${playerId}`);
      setSelectedPlayer(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  if (!teams || teams.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <p className="text-gray-600 text-sm text-center">No teams registered yet</p>
      </div>
    );
  }

  const myTeam = teams.find((t) => String(t._id) === String(myTeamId));
  const others = teams.filter((t) => String(t._id) !== String(myTeamId));

  const sorted = [...others].sort(
    (a, b) => (b.remainingPurse ?? 0) - (a.remainingPurse ?? 0)
  );

  const displayList = myTeam ? [myTeam, ...sorted] : sorted;

  return (
    <>
      {selectedPlayer && (
        <PlayerStatsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">All Teams</p>
            <p className="text-xs text-gray-600 mt-0.5">{teams.length} teams · click to view squad</p>
          </div>
        </div>

        <div>
          {displayList.map((team) => {
            const isMyTeam = String(team._id) === String(myTeamId);
            const rank = isMyTeam ? '-' : sorted.indexOf(team) + 1;
            return (
              <TeamRow
                key={team._id}
                team={team}
                rank={rank}
                isMyTeam={isMyTeam}
                onPlayerClick={openPlayer}
                loadingId={loadingId}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
