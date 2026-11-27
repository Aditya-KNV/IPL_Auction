import React, { useState, useEffect, useRef } from 'react';
import { useAuction }  from '../../hooks/useAuction';
import { useMyTeam }   from '../../hooks/useMyTeam';
import { useAuth }     from '../../context/AuthContext';
import { useRoom }     from '../../context/RoomContext';
import { formatCroreAmount } from '../../utils/currency';
import { hasBattingStats, hasBowlingStats } from '../../utils/playerDisplay';
import { setAudioMuted, isAudioMuted } from '../../utils/auctionAudio';

import PlayerStatsModal, { PlayerStatsDetails } from '../players/PlayerStatsModal';
import BidPanel          from './BidPanel';
import BidFeed           from './BidFeed';
import AuctionTimer      from './AuctionTimer';
import AuctionControls   from './AuctionControls';
import AcceleratedModal  from './AcceleratedModal';
import SoldTicker        from './SoldTicker';

// ── helpers ──────────────────────────────────────────────────────────────────
const getBidderTeamId = (b) => b?.id || b?._id || null;

const ROLE_COLOR = {
  Batsman:        '#3b82f6',
  Bowler:         '#ef4444',
  'All-Rounder':  '#a855f7',
  'Wicket-Keeper':'#f59e0b',
};
const ROLE_LABEL = {
  Batsman:'BAT', Bowler:'BWL', 'All-Rounder':'AR', 'Wicket-Keeper':'WK',
};

// Smooth odometer counter hook
function useOdometer(target) {
  const [display, setDisplay] = useState(target);
  const rafRef   = useRef(null);
  // Tracks the true live (possibly mid-animation) value, so a target change that
  // interrupts an in-flight animation continues smoothly from wherever the
  // display actually is, rather than from a stale "last fully-settled" value.
  const valueRef = useRef(target);

  useEffect(() => {
    const from = valueRef.current;
    const to   = target;

    cancelAnimationFrame(rafRef.current);

    if (from === to) return;

    const duration = 600;
    const start    = performance.now();

    const tick = (now) => {
      // Clamp to [0, 1] on both ends — without the lower clamp, a `now` that lands
      // before `start` (e.g. from React StrictMode's dev-only double-invocation of
      // this effect scheduling a second rAF in the same frame) makes p negative,
      // which sends the ease-out curve negative and the displayed value crashes
      // toward/below zero for a frame or two.
      const p = Math.max(0, Math.min((now - start) / duration, 1));
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const v = from + (to - from) * e;
      valueRef.current = v;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else { valueRef.current = to; setDisplay(to); }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return display;
}

// ── SoldFlash overlay ────────────────────────────────────────────────────────
const SoldFlash = ({ soldFlash }) => {
  if (!soldFlash) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-obsidian/95 border border-neon/25 rounded-3xl
                      px-12 py-10 text-center shadow-[0_0_60px_rgb(var(--neon)/.25)]
                      animate-sold-pop">
        <p className="font-bebas text-7xl tracking-widest text-neon neon-glow">SOLD!</p>
        <p className="text-white text-xl font-bold mt-1">{soldFlash.player?.name}</p>
        <p className="font-bebas text-4xl text-gold-bright gold-glow mt-2">
          ₹ {formatCroreAmount(soldFlash.amount)} CR
        </p>
        <p className="text-white/50 mt-1 text-base">to {soldFlash.team?.name}</p>
        {soldFlash.auto && (
          <p className="text-gold-bright text-xs mt-3 border border-gold-bright/25 px-3 py-1 rounded-full inline-block">
            Auto-sold · timer expired
          </p>
        )}
      </div>
    </div>
  );
};

const UnsoldFlash = ({ player }) => {
  if (!player) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-obsidian/95 border border-bid-red/25 rounded-3xl
                      px-12 py-10 text-center shadow-[0_0_60px_rgba(255,51,85,.2)]
                      animate-unsold-pop">
        <p className="font-bebas text-7xl tracking-widest text-bid-red red-bloom">UNSOLD!</p>
        <p className="text-white text-xl font-bold mt-1">{player?.name}</p>
        <p className="text-white/40 mt-1">{player?.role}</p>
      </div>
    </div>
  );
};

// ── Status badges ────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  active:    'bg-neon/10 text-neon border-neon/25',
  paused:    'bg-orange-400/10 text-orange-300 border-orange-400/25',
  waiting:   'bg-white/[0.05] text-white/40 border-white/[0.08]',
  completed: 'bg-blue-400/10 text-blue-300 border-blue-400/25',
};

// ── Spinner ──────────────────────────────────────────────────────────────────
const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-obsidian">
    <div className="flex flex-col items-center gap-3">
      <svg className="animate-spin h-8 w-8 text-neon" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-neon/60 text-sm tracking-wider">Loading auction…</p>
    </div>
  </div>
);

const EmptyStage = ({ status }) => (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
    {status === 'completed' ? (
      <>
        <svg className="w-10 h-10 text-neon/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-neon/60 font-semibold tracking-wide">Auction Complete</p>
        <p className="text-white/25 text-xs">All players have been processed</p>
      </>
    ) : (
      <>
        <div className="w-12 h-12 rounded-full border border-white/[0.06] flex items-center justify-center">
          <span className="text-2xl animate-hammer-bob inline-block">🔨</span>
        </div>
        <p className="text-white/30 text-sm">Waiting for next player…</p>
      </>
    )}
  </div>
);

// ── Main AuctionBoard ────────────────────────────────────────────────────────
export default function AuctionBoard() {
  const [modalPlayer,  setModalPlayer]  = useState(null);
  const [muted,        setMuted]        = useState(isAudioMuted());
  const [soldHistory,  setSoldHistory]  = useState([]);

  const { user }            = useAuth();
  const { room, teamAssignments } = useRoom();
  const amHost = user?.id != null && room?.hostUserId === String(user.id);
  const myTeamAssignment = user ? teamAssignments?.[user.id] : null;

  const {
    session, currentPlayer, currentBid, minNextBid,
    highestBidder, withdrawnTeams, timeLeft, timerTotal,
    bidHistory, bidError, soldFlash, unsoldFlash,
    loading: auctionLoading, placeBid, withdraw, refetch,
    accelerated, initAcceleratedMode, submitAcceleratedPicks,
    beginAcceleratedAuction, cancelAcceleratedMode,
  } = useAuction();

  const { allTeams, loading: teamLoading } = useMyTeam();

  // Accumulate sold history for the ticker
  useEffect(() => {
    if (soldFlash) setSoldHistory(prev => [soldFlash, ...prev].slice(0, 30));
  }, [soldFlash]);

  const toggleMute = () => { const n = !muted; setMuted(n); setAudioMuted(n); };

  // Odometer display
  const displayBid = useOdometer(currentBid);

  if (auctionLoading || teamLoading) return <Spinner />;

  const isActive   = session?.status === 'active';
  const statusKey  = session?.status ?? 'waiting';
  const soldCount  = session?.soldPlayers?.length ?? 0;
  const unsoldCount= session?.unsoldPlayers?.length ?? 0;
  const amLeading  = !!(myTeamAssignment && highestBidder &&
    String(getBidderTeamId(highestBidder)) === String(myTeamAssignment.teamId));
  const roleColor  = currentPlayer ? (ROLE_COLOR[currentPlayer.role] || '#6b7280') : '#004FC7';
  const leadColor  = highestBidder?.color || (amLeading ? '#FFD060' : '#374151');
  const battingPositions = currentPlayer?.tactical?.positions ?? [];

  return (
    <>
      {/* ── Modals ── */}
      {modalPlayer && <PlayerStatsModal player={modalPlayer} onClose={() => setModalPlayer(null)} />}
      {accelerated && (
        <AcceleratedModal
          players={accelerated.players}
          maxPicks={accelerated.maxPicks ?? 7}
          expectedTeamIds={accelerated.expectedTeamIds}
          submittedTeamIds={accelerated.submittedTeamIds}
          allSubmitted={accelerated.allSubmitted}
          myTeamId={myTeamAssignment?.teamId ?? null}
          isHost={amHost}
          allTeams={allTeams}
          onSubmit={submitAcceleratedPicks}
          onBegin={beginAcceleratedAuction}
          onCancel={cancelAcceleratedMode}
        />
      )}
      <SoldFlash  soldFlash={soldFlash} />
      <UnsoldFlash player={unsoldFlash} />

      {/* ── Shell ── */}
      <div className="flex flex-col gap-3 p-3 bg-obsidian h-full overflow-hidden
                      relative stadium-backdrop">

        {/* ── Status strip ── */}
        <div className="glass-panel top-accent flex-shrink-0 h-[54px] flex items-center justify-between px-5 z-10"
             style={{ '--accent': roleColor, borderRadius: '18px' }}>
          <div className="flex items-center gap-4">
            <span className="text-white/40 text-sm font-semibold">
              {soldCount} sold · {unsoldCount} unsold
            </span>

            <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
              className="flex items-center justify-center w-10 h-10 rounded-full
                         border border-white/[0.08] bg-white/[0.04]
                         text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition">
              {muted
                ? <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                : <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-6.586-3H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.414l4.293-4.293A1 1 0 0112 5v14a1 1 0 01-1.293.95L5.414 15z" /></svg>
              }
            </button>
          </div>

          <div className="flex items-center gap-3">
            {amHost && (
              <AuctionControls session={session} onRefetch={refetch} onAccelerated={initAcceleratedMode} />
            )}
            {isActive && (
              <div className="flex items-center gap-1.5 px-1">
                <span className="w-2 h-2 rounded-full bg-bid-red animate-live-blink" />
                <span className="text-bid-red text-[11px] font-black tracking-[1.5px]">LIVE</span>
              </div>
            )}
            <span className={`px-3.5 py-1.5 rounded-full text-[11px] font-black border tracking-[1.2px] uppercase
                              ${STATUS_STYLE[statusKey] ?? STATUS_STYLE.waiting}`}>
              {statusKey}
            </span>
          </div>
        </div>

        {/* ── Bento grid ── */}
        <div className="flex-1 min-h-0 grid overflow-hidden gap-3
                        grid-cols-1 lg:grid-cols-[220px_1fr_420px]
                        grid-rows-[minmax(0,1fr)]">

          {/* LEFT — Bid Log ──────────────────────────────── */}
          <aside className="glass-panel top-accent hidden lg:flex flex-col min-h-0 overflow-hidden"
                 style={{ '--accent': 'rgb(var(--bid-red))' }}>
            <div className="flex-shrink-0 flex items-center justify-between
                            px-4 py-3 border-b border-white/[0.05]">
              <span className="text-[9px] font-black tracking-[2.5px] text-white/30 uppercase">Bid Log</span>
              {isActive && (
                <span className="text-[9px] font-black text-bid-red bg-bid-red/10
                                 border border-bid-red/25 px-2 py-0.5 rounded-full">
                  ● LIVE
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <BidFeed bids={bidHistory} currentPlayer={currentPlayer} />
            </div>
          </aside>

          {/* CENTER — Main stage (~80% width): player card / bid controls / withdraw ── */}
          <main className="flex flex-col gap-3 min-h-0 overflow-hidden relative"
                style={{ background: `radial-gradient(ellipse 70% 65% at 50% 40%, ${roleColor}12 0%, transparent 70%)` }}>

            {currentPlayer ? (
              <>
                {/* ── Top: player card (name, age, batting position, full stats) ── */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar
                                flex items-center justify-center px-8 py-4">
                  <div className="glass-panel top-accent dot-matrix relative w-full max-w-4xl overflow-hidden
                                  flex items-center justify-center gap-8 lg:gap-14 px-10 py-8"
                       style={{ '--accent': roleColor }}>

                    {/* Role capsule (fills the left of the wide card) */}
                    <div className="hidden sm:flex flex-col items-center gap-2 flex-shrink-0 z-[1]">
                      <span className="text-[9px] font-black tracking-[2px] text-white/30 uppercase">Role</span>
                      <span className="font-bebas text-2xl leading-none px-4 py-2 rounded-xl border"
                            style={{ color: roleColor, borderColor: roleColor + '35', background: roleColor + '12' }}>
                        {currentPlayer.role}
                      </span>
                    </div>
                    <div className="hidden sm:block w-px h-20 flex-shrink-0"
                         style={{ background: `linear-gradient(to bottom, transparent, rgb(var(--fg) / 0.12), transparent)` }} />

                    {/* Name + meta (center) */}
                    <div className="flex-1 min-w-0 text-center z-[1]">
                      <p className="text-[10px] font-bold tracking-[3px] text-white/30 uppercase mb-2">
                        {currentPlayer.auctionSetName || 'UP FOR AUCTION'}
                      </p>
                      <h1 className="font-bebas text-[64px] lg:text-[80px] leading-none text-white tracking-[2px]"
                          style={{ textShadow: `0 4px 32px ${roleColor}55, 0 1px 0 rgba(0,0,0,.3)` }}>
                        {currentPlayer.name}
                      </h1>
                      <div className="flex items-center justify-center gap-2 flex-wrap mt-4">
                        <span className="text-[13px] font-semibold text-white/50 sm:hidden">{currentPlayer.role}</span>
                        {currentPlayer.age && (
                          <>
                            <span className="text-white/15 sm:hidden">·</span>
                            <span className="text-[13px] text-white/40">{currentPlayer.age} yrs</span>
                          </>
                        )}
                        {currentPlayer.nationality && (
                          <>
                            <span className="text-white/15">·</span>
                            <span className="text-[13px] text-white/40">{currentPlayer.nationality}</span>
                          </>
                        )}
                        {battingPositions.length > 0 && (
                          <>
                            <span className="text-white/15">·</span>
                            <span className="text-[13px] text-white/40">
                              Batting Pos {battingPositions.join(', ')}
                            </span>
                          </>
                        )}
                      </div>

                      <button onClick={() => setModalPlayer(currentPlayer)}
                        className="lg:hidden mt-5 text-[11px] font-bold tracking-wider text-white/40
                                   border border-white/[0.1] hover:border-white/25 hover:bg-white/[0.03]
                                   hover:text-white/70 px-5 py-2 rounded-lg transition-all">
                        FULL STATS
                      </button>
                    </div>

                    <div className="hidden sm:block w-px h-20 flex-shrink-0"
                         style={{ background: `linear-gradient(to bottom, transparent, rgb(var(--fg) / 0.12), transparent)` }} />
                    {/* Base price capsule (fills the right of the wide card) */}
                    <div className="hidden sm:flex flex-col items-center gap-2 flex-shrink-0 z-[1]">
                      <span className="text-[9px] font-black tracking-[2px] text-white/30 uppercase">Base Price</span>
                      <span className="font-bebas text-2xl leading-none px-4 py-2 rounded-xl border
                                       text-gold-bright border-gold-bright/30 bg-gold-bright/[0.08]">
                        ₹{formatCroreAmount(currentPlayer.basePrice)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Middle: current bid + leader + timer, quick bid buttons ── */}
                <div className="flex-shrink-0 flex justify-center px-4">
                <div className="glass-panel top-accent flex-shrink-0 w-full max-w-xl overflow-hidden"
                     style={{ '--accent': 'rgb(var(--neon))' }}>
                  <div className="flex items-center justify-center px-4 py-3 gap-0
                                  border-b border-white/[0.06]">
                    {/* Current bid (odometer) */}
                    <div className="flex-1">
                      <p className="text-[8px] font-black tracking-[2px] text-white/25 uppercase mb-0.5">
                        Current Bid
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="font-bebas text-2xl text-neon leading-none">₹</span>
                        <span className="font-bebas text-[48px] text-neon leading-none tabular-nums neon-glow">
                          {formatCroreAmount(displayBid)}
                        </span>
                        <span className="font-bebas text-xl text-neon/40 leading-none">CR</span>
                      </div>
                    </div>

                    <div className="w-px self-stretch mx-3"
                         style={{ background: `linear-gradient(to bottom, transparent, rgb(var(--fg) / 0.12), transparent)` }} />

                    {/* Leading team */}
                    <div className="flex flex-col items-center gap-1 px-2">
                      <p className="text-[8px] font-black tracking-[2px] text-white/25 uppercase">Leading</p>
                      {highestBidder ? (
                        <>
                          <div className="w-10 h-10 rounded-full flex items-center justify-center
                                          text-[10px] font-black border-2"
                               style={{ borderColor: leadColor, color: leadColor, background: leadColor + '22', boxShadow: `0 0 16px ${leadColor}30` }}>
                            {highestBidder.shortName?.slice(0, 3) ?? '?'}
                          </div>
                          <p className="text-[9px] font-bold" style={{ color: leadColor }}>
                            {highestBidder.shortName}
                          </p>
                          {amLeading && (
                            <span className="text-[8px] font-black text-neon tracking-widest">★ YOU</span>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-white/20">No bids</p>
                      )}
                    </div>

                    <div className="w-px self-stretch mx-3"
                         style={{ background: `linear-gradient(to bottom, transparent, rgb(var(--fg) / 0.12), transparent)` }} />

                    {/* Timer */}
                    <AuctionTimer
                      timeLeft={timeLeft}
                      totalDuration={timerTotal}
                      active={isActive && !!currentPlayer}
                    />
                  </div>

                  {/* Quick bid buttons */}
                  <BidPanel
                    mode="bid"
                    currentBid={currentBid}
                    minNextBid={minNextBid}
                    highestBidder={highestBidder}
                    withdrawnTeams={withdrawnTeams}
                    currentPlayer={currentPlayer}
                    bidError={bidError}
                    onBid={placeBid}
                    onWithdraw={withdraw}
                  />
                </div>
                </div>

                {/* ── Bottom: withdraw — always docked, never clipped ── */}
                <div className="flex-shrink-0 flex justify-center px-4 pb-1">
                <div className="glass-panel top-accent flex-shrink-0 w-full max-w-xl overflow-hidden"
                     style={{ '--accent': 'rgb(var(--bid-red))' }}>
                  <BidPanel
                    mode="withdraw"
                    currentBid={currentBid}
                    minNextBid={minNextBid}
                    highestBidder={highestBidder}
                    withdrawnTeams={withdrawnTeams}
                    currentPlayer={currentPlayer}
                    bidError={bidError}
                    onBid={placeBid}
                    onWithdraw={withdraw}
                  />
                </div>
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <EmptyStage status={session?.status} />
              </div>
            )}
          </main>

          {/* RIGHT — Player stats ───────────────────────── */}
          <aside className="glass-panel top-accent hidden lg:flex flex-col min-h-0 overflow-hidden"
                 style={{ '--accent': 'rgb(var(--gold-bright))' }}>
            <div className="flex-shrink-0 flex items-center justify-between
                            px-4 py-3 border-b border-white/[0.05]">
              <span className="text-[9px] font-black tracking-[2.5px] text-white/30 uppercase">Player Stats</span>
              {currentPlayer && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider"
                      style={{ color: roleColor, background: roleColor + '15', borderColor: roleColor + '35' }}>
                  {ROLE_LABEL[currentPlayer.role] ?? currentPlayer.role}
                </span>
              )}
            </div>
            {/* keyed by player so the scroll position resets for each new player */}
            <div key={currentPlayer?._id ?? 'none'}
                 className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              {!currentPlayer ? (
                <div className="flex items-center justify-center h-full px-6 text-center">
                  <p className="text-white/20 text-xs">No player currently up for auction</p>
                </div>
              ) : (
                <>
                  <div className="px-5 pt-3">
                    <p className="text-white font-bold text-[15px] truncate">{currentPlayer.name}</p>
                    <p className="text-white/30 text-[11px] mt-0.5">
                      {[
                        currentPlayer.role,
                        currentPlayer.nationality,
                        currentPlayer.age && `${currentPlayer.age} yrs`,
                        currentPlayer.batting_style === 'left-handed' ? 'Left-handed' : 'Right-handed',
                        currentPlayer.bowling_style,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <PlayerStatsDetails
                    player={currentPlayer}
                    showBatting={hasBattingStats(currentPlayer.role)}
                    showBowling={hasBowlingStats(currentPlayer.role)}
                  />
                </>
              )}
            </div>
          </aside>
        </div>

        {/* ── Bottom ticker ── */}
        <SoldTicker soldHistory={soldHistory} />
      </div>
    </>
  );
}
