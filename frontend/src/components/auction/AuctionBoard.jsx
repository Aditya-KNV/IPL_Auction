import React, { useState } from "react";
import { useAuction } from "../../hooks/useAuction";
import { useMyTeam } from "../../hooks/useMyTeam";
import { useAuth } from "../../context/AuthContext";
import { useRoom } from "../../context/RoomContext";
import { useSocket } from "../../context/SocketContext";
import { formatCroreAmount } from "../../utils/currency";
import PlayerCard from "../players/PlayerCard";
import PlayerStatsModal from "../players/PlayerStatsModal";
import BidPanel from "./BidPanel";
import BidFeed from "./BidFeed";
import AuctionTimer from "./AuctionTimer";
import AuctionControls from "./AuctionControls";
import AcceleratedModal from "./AcceleratedModal";
import OtherTeamsPanel from "./OtherTeamsPanel";
import { hasBattingStats, hasBowlingStats } from "../../utils/playerDisplay";
import { setAudioMuted, isAudioMuted } from "../../utils/auctionAudio";


// ── Role-based section builder ────────────────────────────────────────────────
// Builds an ordered list of sections (phases + skills) based on player role.
// Batters  → Batting Phases + Batting Skills
// Bowlers  → Bowling Phases + Bowling Skills
// All-Rounders → both batting sections then both bowling sections
// No impact / fitness / tactical — those clutter the right panel.
const buildSections = (player) => {
  if (!player) return [];
  const sections = [];
  const showBatting = hasBattingStats(player.role);
  const showBowling = hasBowlingStats(player.role);

  if (showBatting) {
    sections.push({
      title: "Batting Phases",
      type: "batting",
      color: "text-blue-300",
      border: "border-blue-500/20",
      bg: "bg-blue-500/10",
      items: [
        { label: "Powerplay", rating: player.batting?.phases?.powerplay?.rating ?? 0, sr: player.batting?.phases?.powerplay?.strike_rate },
        { label: "Middle",    rating: player.batting?.phases?.middle?.rating    ?? 0, sr: player.batting?.phases?.middle?.strike_rate    },
        { label: "Death",     rating: player.batting?.phases?.death?.rating     ?? 0, sr: player.batting?.phases?.death?.strike_rate     },
      ],
    });
    sections.push({
      title: "Batting Skills",
      type: "batting-skills",
      color: "text-sky-300",
      border: "border-sky-500/20",
      bg: "bg-sky-500/10",
      items: [
        { label: "Finishing",  rating: player.batting?.skills?.finishing      ?? 0 },
        { label: "Power Hit",  rating: player.batting?.skills?.power_hitting  ?? 0 },
        { label: "Anchor",     rating: player.batting?.skills?.anchor         ?? 0 },
        { label: "Spin Play",  rating: player.batting?.skills?.spin_play      ?? 0 },
        { label: "Pace Play",  rating: player.batting?.skills?.pace_play      ?? 0 },
      ],
    });
  }

  if (showBowling) {
    sections.push({
      title: "Bowling Phases",
      type: "bowling",
      color: "text-red-300",
      border: "border-red-500/20",
      bg: "bg-red-500/10",
      items: [
        { label: "Powerplay", rating: player.bowling?.phases?.powerplay ?? 0 },
        { label: "Middle",    rating: player.bowling?.phases?.middle    ?? 0 },
        { label: "Death",     rating: player.bowling?.phases?.death     ?? 0 },
      ],
    });
    sections.push({
      title: "Bowling Skills",
      type: "bowling-skills",
      color: "text-rose-300",
      border: "border-rose-500/20",
      bg: "bg-rose-500/10",
      items: [
        { label: "Variations", rating: player.bowling?.skills?.variations ?? 0 },
        { label: "Yorker",     rating: player.bowling?.skills?.yorker     ?? 0 },
        { label: "Bouncer",    rating: player.bowling?.skills?.bouncer    ?? 0 },
      ],
      overs: player.tactical?.overs,
      bowlingPhases: Array.isArray(player.bowling?.positions)
        ? [['PP', 0], ['MID', 1], ['DEATH', 2]]
            .filter(([, i]) => player.bowling.positions[i] === 1)
            .map(([l]) => l)
        : [],
    });
  }

  return sections;
};

const PlayerRatingsPanel = ({ player, expanded = false, onClose }) => {
  if (!player) return null;

  const sections = buildSections(player);
  const gap = expanded ? "gap-1.5" : "gap-2";
  const titleSize = expanded ? "text-[9px]" : "text-[10px]";
  const valSize = expanded ? "text-xs" : "text-sm";

  return (
    <div className={`rounded-2xl border border-gray-800 bg-gray-900/80 flex flex-col ${expanded ? "h-full p-3" : "p-4"}`}>
      {/* Header */}
      <div className={`${expanded ? "mb-2" : "mb-3"} flex items-center justify-between gap-3 flex-shrink-0`}>
        <div>
          <SectionLabel>Player Ratings</SectionLabel>
          <p className={`${expanded ? "text-xs" : "text-sm"} font-semibold text-white truncate`}>{player.name}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border border-gray-700 ${expanded ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white`}
          >
            Close
          </button>
        )}
      </div>

      {/* Sections: phases then skills, role-gated */}
      <div className={`${expanded ? "space-y-3" : "space-y-4"} flex-1 overflow-y-auto custom-scrollbar pr-1`}>
        {sections.map((section) => (
          <div key={section.title}>
            <p className={`mb-1.5 ${titleSize} font-bold uppercase tracking-[0.2em] ${section.color}`}>
              {section.title}
            </p>
            <div className={`grid grid-cols-3 ${gap}`}>
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-lg border ${section.border} ${section.bg} px-2 py-1.5`}
                >
                  <p className={`${expanded ? "text-[9px]" : "text-[10px]"} uppercase tracking-[0.16em] opacity-70`}>
                    {item.label}
                  </p>
                  <p className={`mt-0.5 ${valSize} font-black leading-none ${section.color}`}>
                    {item.rating ?? 0}
                    <span className="text-[10px] ml-0.5 font-semibold opacity-60">/10</span>
                  </p>
                  {item.sr != null && (
                    <p className="text-[10px] text-gray-500 mt-0.5">SR {item.sr}</p>
                  )}
                </div>
              ))}
            </div>
            {section.overs != null && (
              <p className={`mt-1.5 ${titleSize} text-gray-500`}>
                Overs quota: <span className="font-semibold text-white">{section.overs}</span>
              </p>
            )}
            {section.bowlingPhases?.length > 0 && (
              <p className={`mt-1 ${titleSize} text-gray-500`}>
                Phases:{' '}
                <span className="font-semibold text-red-300">{section.bowlingPhases.join(', ')}</span>
              </p>
            )}
          </div>
        ))}

        {/* Extra sections only in expanded (View Stats) mode */}
        {expanded && (
          <>
            {/* Role Impact */}
            <div>
              <p className={`mb-1.5 ${titleSize} font-bold uppercase tracking-[0.2em] text-amber-300`}>Role Impact</p>
              <div className={`grid grid-cols-3 ${gap}`}>
                {[
                  { label: "Match Winner", rating: player.role_impact?.match_winner ?? 0 },
                  { label: "Clutch",       rating: player.role_impact?.clutch       ?? 0 },
                  { label: "Consistency",  rating: player.role_impact?.consistency  ?? 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-[0.16em] opacity-70">{item.label}</p>
                    <p className={`mt-0.5 ${valSize} font-black leading-none text-amber-300`}>
                      {item.rating}<span className="text-[10px] ml-0.5 font-semibold opacity-60">/10</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Fitness & Tactical */}
            <div>
              <p className={`mb-1.5 ${titleSize} font-bold uppercase tracking-[0.2em] text-green-300`}>Fitness & Tactical</p>
              <div className={`grid grid-cols-3 ${gap}`}>
                {[
                  { label: "Stamina",      rating: player.fitness?.stamina      ?? 0 },
                  { label: "Injury Risk",  rating: player.fitness?.injury_risk  ?? 0, invert: true },
                  { label: "Flexibility",  rating: player.tactical?.flexibility ?? 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1.5">
                    <p className="text-[9px] uppercase tracking-[0.16em] opacity-70">{item.label}</p>
                    <p className={`mt-0.5 ${valSize} font-black leading-none text-green-300`}>
                      {item.rating}<span className="text-[10px] ml-0.5 font-semibold opacity-60">/10</span>
                    </p>
                    {item.invert && <p className="text-[9px] text-gray-500 mt-0.5">lower = better</p>}
                  </div>
                ))}
              </div>
              {player.tactical?.positions?.length > 0 && (
                <p className={`mt-1.5 ${titleSize} text-gray-500`}>
                  Bat positions: <span className="font-semibold text-white">{player.tactical.positions.join(', ')}</span>
                </p>
              )}
              {(player.tactical?.captaincy ?? 0) > 0 && (
                <p className={`mt-1 ${titleSize} text-gray-500`}>
                  Captaincy: <span className="font-semibold text-white">{player.tactical.captaincy}</span>
                </p>
              )}
              {player.bowling?.positions?.some((v) => v === 1) && (
                <p className={`mt-1 ${titleSize} text-gray-500`}>
                  Bowl phases:{' '}
                  <span className="font-semibold text-red-300">
                    {[['PP', 0], ['MID', 1], ['DEATH', 2]]
                      .filter(([, i]) => (player.bowling.positions[i] ?? 0) === 1)
                      .map(([l]) => l)
                      .join(', ')}
                  </span>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const SoldFlash = ({ soldFlash }) => {
  if (!soldFlash) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-gray-950/95 border-2 border-ipl-gold rounded-3xl px-12 py-10 text-center shadow-2xl shadow-ipl-gold/30 animate-bounce-in">
        <p className="text-ipl-gold text-6xl font-black tracking-widest">SOLD!</p>
        <p className="text-white text-2xl font-bold mt-2">{soldFlash.player?.name}</p>
        <p className="text-green-400 text-4xl font-black mt-2 tabular-nums">
          Rs {formatCroreAmount(soldFlash.amount)} Cr
        </p>
        <p className="text-gray-400 mt-1 text-lg">to {soldFlash.team?.name}</p>
        {soldFlash.auto && (
          <p className="text-amber-500 text-xs mt-3 border border-amber-500/30 px-3 py-1 rounded-full inline-block">
            Auto-sold - timer expired
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
      <div className="bg-gray-950/95 border-2 border-red-500 rounded-3xl px-12 py-10 text-center shadow-2xl shadow-red-500/20 animate-bounce-in">
        <p className="text-red-500 text-6xl font-black tracking-widest">UNSOLD!</p>
        <p className="text-white text-2xl font-bold mt-2">{player?.name}</p>
        <p className="text-gray-400 mt-1 text-lg">{player?.role}</p>
      </div>
    </div>
  );
};

const STATUS_STYLES = {
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  waiting: "bg-gray-700/40 text-gray-400 border-gray-600/40",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <svg className="animate-spin h-10 w-10 text-ipl-gold" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-ipl-gold">Loading auction...</p>
    </div>
  </div>
);

const SectionLabel = ({ children }) => (
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 px-0.5">{children}</p>
);
const getBidderTeamId = (bidder) => bidder?.id || bidder?._id || null;

const EmptySlot = ({ status }) => (
  <div className="flex flex-col items-center justify-center h-44 bg-gray-900/50 rounded-2xl border border-dashed border-gray-700 gap-2">
    {status === "completed" ? (
      <>
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-green-600 font-semibold">Auction complete</p>
        <p className="text-gray-600 text-xs">All players processed</p>
      </>
    ) : (
      <>
        <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-gray-600 text-sm">Waiting for next player...</p>
      </>
    )}
  </div>
);

export default function AuctionBoard() {
  const [modalPlayer, setModalPlayer] = useState(null);
  const [muted, setMuted] = useState(isAudioMuted());
  const { user } = useAuth();
  const { room, teamAssignments } = useRoom();
  const { socket } = useSocket();
  const amHost = room?.hostId === socket?.id;
  const myTeamAssignment = user ? teamAssignments?.[user.id] : null;

  const {
    session,
    currentPlayer,
    currentBid,
    minNextBid,
    highestBidder,
    withdrawnTeams,
    timeLeft,
    timerTotal,
    bidHistory,
    bidError,
    soldFlash,
    unsoldFlash,
    loading: auctionLoading,
    placeBid,
    withdraw,
    refetch,
    accelerated,
    initAcceleratedMode,
    submitAcceleratedPicks,
    beginAcceleratedAuction,
    cancelAcceleratedMode,
  } = useAuction();

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setAudioMuted(next);
  };

  const { myTeam, allTeams, loading: teamLoading } = useMyTeam();

  if (auctionLoading || teamLoading) return <Spinner />;

  const isActive = session?.status === "active";
  const statusKey = session?.status ?? "waiting";
  const soldCount = session?.soldPlayers?.length ?? 0;
  const unsoldCount = session?.unsoldPlayers?.length ?? 0;
  const amLeading = !!(
    myTeamAssignment &&
    highestBidder &&
    String(getBidderTeamId(highestBidder)) === String(myTeamAssignment.teamId)
  );
  const liveFrameColor = highestBidder?.color || (amLeading ? '#D4AF37' : '#374151');

  return (
    <>
      {modalPlayer && (
        <PlayerStatsModal player={modalPlayer} onClose={() => setModalPlayer(null)} />
      )}

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

      <SoldFlash soldFlash={soldFlash} />
      <UnsoldFlash player={unsoldFlash} />

      <div className="flex flex-col bg-ipl-dark lg:overflow-hidden lg:h-[calc(100vh-105px)]">
        <div className="flex-shrink-0 border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-950/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-gray-400 text-sm font-semibold">
                {soldCount} sold · {unsoldCount} unsold
              </p>
            </div>
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
              className="flex items-center justify-center w-7 h-7 rounded-full border border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-white transition"
            >
              {muted ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4.243-4.243M12 18l4.243-4.243M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {amHost && (
              <AuctionControls
                session={session}
                onRefetch={refetch}
                onAccelerated={initAcceleratedMode}
              />
            )}
            {isActive && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-xs font-semibold">LIVE</span>
              </div>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_STYLES[statusKey] ?? STATUS_STYLES.waiting}`}>
              {statusKey.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="lg:flex-1 lg:overflow-hidden grid grid-cols-1 lg:grid-cols-5">
          <div className="order-2 lg:order-2 lg:col-span-3 border-t lg:border-t-0 lg:border-l border-gray-800 lg:overflow-y-auto lg:h-full">
            <div className="p-5 space-y-5">
              {currentPlayer && <PlayerRatingsPanel player={currentPlayer} />}
              <div>
                <SectionLabel>{amHost ? "All Teams" : "Other Teams"}</SectionLabel>
                <OtherTeamsPanel teams={allTeams} myTeamId={myTeam?._id} teamAssignments={teamAssignments} />
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-1 lg:col-span-2 lg:h-full lg:overflow-y-auto">
            <div className="p-5 space-y-4">
              <div className="rounded-3xl p-4 space-y-4 transition-all duration-300">
                <div>
                  <SectionLabel>Up for Auction</SectionLabel>
                  {currentPlayer ? (
                    <PlayerCard
                      player={currentPlayer}
                      currentBid={currentBid}
                      highlighted
                      compact
                      onViewStats={() => setModalPlayer(currentPlayer)}
                    />
                  ) : (
                    <EmptySlot status={session?.status} />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="bg-gray-900/80 rounded-2xl border flex flex-col items-center justify-center py-4 transition-all duration-300"
                    style={{ borderColor: liveFrameColor }}
                  >
                    <AuctionTimer
                      timeLeft={timeLeft}
                      totalDuration={timerTotal}
                      active={isActive && !!currentPlayer}
                    />
                  </div>

                  <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4 flex flex-col justify-center transition-all duration-300">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Current Bid</p>
                    <p className="text-4xl font-black text-white tabular-nums mt-1 leading-none">
                      Rs {formatCroreAmount(currentBid)}
                      <span className="text-lg text-gray-500 font-normal ml-0.5">Cr</span>
                    </p>
                    {highestBidder ? (
                      <div className="flex items-center gap-1.5 mt-2">
                        {highestBidder.color && (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: highestBidder.color }}
                          />
                        )}
                        <p className="text-sm text-green-400 font-semibold truncate">{highestBidder.shortName}</p>
                        <p className="text-xs text-gray-600 truncate hidden xl:block">leading</p>
                      </div>
                    ) : (
                      currentPlayer && <p className="text-xs text-gray-600 mt-2">No bids yet</p>
                    )}
                    {amLeading && (
                      <div className="mt-3">
                        <span className="inline-flex items-center rounded-xl border border-ipl-gold px-3 py-1.5 text-sm font-bold text-ipl-gold">
                          You're leading
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <BidPanel
                currentBid={currentBid}
                minNextBid={minNextBid}
                highestBidder={highestBidder}
                withdrawnTeams={withdrawnTeams}
                currentPlayer={currentPlayer}
                bidError={bidError}
                onBid={placeBid}
                onWithdraw={withdraw}
              />

              {(currentPlayer || bidHistory.length > 0) && (
                <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4">
                  <SectionLabel>Bid History</SectionLabel>
                  <BidFeed bids={bidHistory} highestBidder={highestBidder} currentPlayer={currentPlayer} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
