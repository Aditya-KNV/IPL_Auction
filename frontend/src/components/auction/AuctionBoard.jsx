import React, { useState, useEffect, useRef } from 'react';
import { useAuction }  from '../../hooks/useAuction';
import { useMyTeam }   from '../../hooks/useMyTeam';
import { useAuth }     from '../../context/AuthContext';
import { useRoom }     from '../../context/RoomContext';
import { formatCroreAmount } from '../../utils/currency';
import { setAudioMuted, isAudioMuted } from '../../utils/auctionAudio';

import PlayerStatsModal  from '../players/PlayerStatsModal';
import BidPanel          from './BidPanel';
import BidFeed           from './BidFeed';
import AuctionTimer      from './AuctionTimer';
import AuctionControls   from './AuctionControls';
import AcceleratedModal  from './AcceleratedModal';
import OtherTeamsPanel   from './OtherTeamsPanel';
import SoldTicker        from './SoldTicker';

// ── helpers ──────────────────────────────────────────────────────────────────
const getBidderTeamId = (b) => b?.id || b?._id || null;

const ROLE_COLOR = {
  Batsman:        '#3b82f6',
  Bowler:         '#ef4444',
  'All-Rounder':  '#a855f7',
  'Wicket-Keeper':'#f59e0b',
};
// Smooth odometer counter hook
function useOdometer(target) {
  const [display, setDisplay] = useState(target);
  const rafRef  = useRef(null);
  const fromRef = useRef(target);

  useEffect(() => {
    const from     = fromRef.current;
    const to       = target;
    if (from === to) return;
    const duration = 600;
    const start    = performance.now();

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const v = from + (to - from) * e;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else { setDisplay(to); fromRef.current = to; }
    });
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
                      px-12 py-10 text-center shadow-[0_0_60px_rgba(0,255,102,.25)]
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

  const { myTeam, allTeams, loading: teamLoading } = useMyTeam();

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
      <div className="flex flex-col bg-obsidian h-full overflow-hidden
                      relative ambient-glows">

        {/* ── Status strip ── */}
        <div className="flex-shrink-0 h-[46px] flex items-center justify-between px-5
                        border-b border-white/[0.05] bg-obsidian/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <span className="text-white/30 text-[11px] font-semibold">
              {soldCount} sold · {unsoldCount} unsold
            </span>

            <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
              className="flex items-center justify-center w-6 h-6 rounded-full
                         border border-white/[0.08] bg-white/[0.04]
                         text-white/30 hover:text-white/60 transition">
              {muted
                ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-6.586-3H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.414l4.293-4.293A1 1 0 0112 5v14a1 1 0 01-1.293.95L5.414 15z" /></svg>
              }
            </button>
          </div>

          <div className="flex items-center gap-3">
            {amHost && (
              <AuctionControls session={session} onRefetch={refetch} onAccelerated={initAcceleratedMode} />
            )}
            {isActive && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-bid-red animate-live-blink" />
                <span className="text-bid-red text-[10px] font-black tracking-[2px]">LIVE</span>
              </div>
            )}
            <span className={`px-3 py-1 rounded-full text-[10px] font-black border tracking-[1.5px] uppercase
                              ${STATUS_STYLE[statusKey] ?? STATUS_STYLE.waiting}`}>
              {statusKey}
            </span>
          </div>
        </div>

        {/* ── Bento grid ── */}
        <div className="flex-1 min-h-0 grid overflow-hidden
                        grid-cols-1 lg:grid-cols-[210px_1fr_420px]
                        grid-rows-[minmax(0,1fr)]">

          {/* LEFT — Bid Log ──────────────────────────────── */}
          <aside className="hidden lg:flex flex-col min-h-0 border-r border-white/[0.05]
                            bg-surface overflow-hidden">
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
          <main className="flex flex-col min-h-0 overflow-hidden relative"
                style={{ background: `radial-gradient(ellipse 70% 65% at 50% 40%, ${roleColor}12 0%, transparent 70%)` }}>

            {currentPlayer ? (
              <>
                {/* ── Top: player card (name, age, batting position, full stats) ── */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar
                                flex items-center justify-center px-8 py-4"
                     style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="w-full max-w-4xl flex items-center justify-center gap-8 lg:gap-14
                                  rounded-3xl border border-white/[0.06] bg-white/[0.015] px-10 py-8">

                    {/* Role tile (fills the left of the wide card) */}
                    <div className="hidden sm:block flex-shrink-0 text-center">
                      <p className="text-[9px] font-black tracking-[2px] text-white/25 uppercase mb-1.5">Role</p>
                      <p className="font-bebas text-3xl leading-none" style={{ color: roleColor }}>
                        {currentPlayer.role}
                      </p>
                    </div>
                    <div className="hidden sm:block w-px h-20 bg-white/[0.06] flex-shrink-0" />

                    {/* Name + meta (center) */}
                    <div className="flex-1 min-w-0 text-center">
                      <p className="text-[10px] font-bold tracking-[3px] text-white/30 uppercase mb-2">
                        {currentPlayer.auctionSetName || 'UP FOR AUCTION'}
                      </p>
                      <h1 className="font-bebas text-[64px] lg:text-[80px] leading-none text-white tracking-[2px]"
                          style={{ textShadow: `0 2px 24px ${roleColor}40` }}>
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
                        className="mt-5 text-[11px] font-bold tracking-wider text-white/40
                                   border border-white/[0.1] hover:border-white/25
                                   hover:text-white/70 px-5 py-2 rounded-lg transition">
                        FULL STATS
                      </button>
                    </div>

                    <div className="hidden sm:block w-px h-20 bg-white/[0.06] flex-shrink-0" />
                    {/* Base price tile (fills the right of the wide card) */}
                    <div className="hidden sm:block flex-shrink-0 text-center">
                      <p className="text-[9px] font-black tracking-[2px] text-white/25 uppercase mb-1.5">Base Price</p>
                      <p className="font-bebas text-3xl leading-none text-white/60">
                        ₹{formatCroreAmount(currentPlayer.basePrice)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Middle: current bid + leader + timer, quick bid buttons ── */}
                <div className="flex-shrink-0 border-b border-white/[0.05] bg-obsidian/60">
                  <div className="flex items-center justify-center px-4 py-3 gap-0 max-w-xl mx-auto
                                  border-b border-white/[0.04]">
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

                    <div className="w-px bg-white/[0.06] self-stretch mx-3" />

                    {/* Leading team */}
                    <div className="flex flex-col items-center gap-1 px-2">
                      <p className="text-[8px] font-black tracking-[2px] text-white/25 uppercase">Leading</p>
                      {highestBidder ? (
                        <>
                          <div className="w-10 h-10 rounded-full flex items-center justify-center
                                          text-[10px] font-black border-2"
                               style={{ borderColor: leadColor, color: leadColor, background: leadColor + '22' }}>
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

                    <div className="w-px bg-white/[0.06] self-stretch mx-3" />

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

                {/* ── Bottom: withdraw — always docked, never clipped ── */}
                <div className="flex-shrink-0 bg-obsidian/90 backdrop-blur-sm">
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
              </>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <EmptyStage status={session?.status} />
              </div>
            )}
          </main>

          {/* RIGHT — Purse tracker ───────────────────────── */}
          <aside className="hidden lg:flex flex-col min-h-0 border-l border-white/[0.05]
                            bg-surface overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between
                            px-4 py-3 border-b border-white/[0.05]">
              <span className="text-[9px] font-black tracking-[2.5px] text-white/30 uppercase">Team Purse</span>
              <span className="text-[9px] text-white/20 bg-white/[0.04] border border-white/[0.06]
                               px-2 py-0.5 rounded-full font-bold tracking-wider">
                {allTeams.length} TEAMS
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <OtherTeamsPanel
                teams={allTeams}
                myTeamId={myTeam?._id}
                teamAssignments={teamAssignments}
              />
            </div>
          </aside>
        </div>

        {/* ── Bottom ticker ── */}
        <SoldTicker soldHistory={soldHistory} />
      </div>
    </>
  );
}
