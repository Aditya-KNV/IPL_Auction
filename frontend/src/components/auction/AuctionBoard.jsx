import React, { useState } from "react";
import { useAuction } from "../../hooks/useAuction";
import { useMyTeam } from "../../hooks/useMyTeam";
import { useAuth } from "../../context/AuthContext";
import { useRoom } from "../../context/RoomContext";
import { useSocket } from "../../context/SocketContext";
import { formatCroreAmount } from "../../utils/currency";
import PlayerCard from "../players/PlayerCard";
import BidPanel from "./BidPanel";
import BidFeed from "./BidFeed";
import AuctionTimer from "./AuctionTimer";
import AuctionControls from "./AuctionControls";
import OtherTeamsPanel from "./OtherTeamsPanel";
import { hasBattingStats, hasBowlingStats } from "../../utils/playerDisplay";

const METRIC_STYLES = {
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-200",
  red: "border-red-500/20 bg-red-500/10 text-red-200",
  gold: "border-amber-500/20 bg-amber-500/10 text-amber-100",
  green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
};

const RatingMetric = ({ label, value, tone = "gold", compact = false }) => (
  <div className={`rounded-xl border ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} ${METRIC_STYLES[tone] ?? METRIC_STYLES.gold}`}>
    <p className={`${compact ? "text-[9px]" : "text-[10px]"} uppercase tracking-[0.18em] opacity-70`}>{label}</p>
    <p className={`${compact ? "mt-0.5 text-base" : "mt-1 text-lg"} font-black leading-none`}>
      {value ?? 0}
      <span className={`${compact ? "text-[10px]" : "text-xs"} ml-0.5 font-semibold opacity-70`}>/10</span>
    </p>
  </div>
);

const SubRatingRow = ({ label, value, tone = "gold", compact = false }) => (
  <div className={`flex items-center justify-between rounded-lg border ${compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs"} ${METRIC_STYLES[tone] ?? METRIC_STYLES.gold}`}>
    <span className="uppercase tracking-[0.16em] opacity-75">{label}</span>
    <span className={`${compact ? "text-xs" : "text-sm"} font-bold`}>
      {value ?? 0}
      <span className={`${compact ? "text-[9px]" : "text-[10px]"} ml-0.5 opacity-70`}>/10</span>
    </span>
  </div>
);

const StatChip = ({ label, value, compact = false }) => (
  <div className={`rounded-lg border border-gray-800 bg-gray-950/60 ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
    <p className={`${compact ? "text-[9px]" : "text-[10px]"} uppercase tracking-[0.16em] text-gray-500`}>{label}</p>
    <p className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} font-semibold text-white break-words`}>
      {value || "—"}
    </p>
  </div>
);

const buildRatings = (player) => {
  if (!player) return [];

  const average = (values) => {
    const safeValues = values.map((value) => value ?? 0);
    if (!safeValues.length) return 0;
    return Math.round((safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length) * 10) / 10;
  };

  const batting = [
    ["Powerplay Bat", player.batting?.phases?.powerplay?.rating, "blue"],
    ["Middle Bat", player.batting?.phases?.middle?.rating, "blue"],
    ["Death Bat", player.batting?.phases?.death?.rating, "blue"],
  ];
  const bowling = [
    ["Powerplay Bowl", player.bowling?.phases?.powerplay, "red"],
    ["Middle Bowl", player.bowling?.phases?.middle, "red"],
    ["Death Bowl", player.bowling?.phases?.death, "red"],
  ];
  const impact = [
    ["Match Winner", player.role_impact?.match_winner, "gold"],
    ["Clutch", player.role_impact?.clutch, "gold"],
    ["Consistency", player.role_impact?.consistency, "green"],
  ];

  if (!hasBattingStats(player.role)) return [...bowling, ...impact];
  if (!hasBowlingStats(player.role)) return [...batting, ...impact];
  return [
    ["Batting", average(batting.map(([, value]) => value)), "blue"],
    ["Bowling", average(bowling.map(([, value]) => value)), "red"],
    ...impact,
  ];
};

const buildSubRatings = (player) => {
  if (!player) return [];

  const battingSkills = [
    ["Finishing", player.batting?.skills?.finishing, "blue"],
    ["Power Hitting", player.batting?.skills?.power_hitting, "blue"],
    ["Anchor", player.batting?.skills?.anchor, "blue"],
    ["Spin Play", player.batting?.skills?.spin_play, "blue"],
    ["Pace Play", player.batting?.skills?.pace_play, "blue"],
  ];
  const bowlingSkills = [
    ["Variations", player.bowling?.skills?.variations, "red"],
    ["Yorker", player.bowling?.skills?.yorker, "red"],
    ["Bouncer", player.bowling?.skills?.bouncer, "red"],
  ];
  const generalSkills = [
    ["Stamina", player.fitness?.stamina, "green"],
    ["Flexibility", player.tactical?.flexibility, "green"],
  ];

  if (!hasBattingStats(player.role)) {
    return [
      { title: "Bowling Skills", items: bowlingSkills },
      { title: "General", items: generalSkills },
    ];
  }

  if (!hasBowlingStats(player.role)) {
    return [
      { title: "Batting Skills", items: battingSkills },
      { title: "General", items: generalSkills },
    ];
  }

  return [
    { title: "Batting Skills", items: battingSkills },
    { title: "Bowling Skills", items: bowlingSkills },
    { title: "General", items: generalSkills },
  ];
};

const buildProfileStats = (player) => [
  ["Batting Style", player.batting_style],
  ["Bowling Style", player.bowling_style],
  ["Positions", Array.isArray(player.tactical?.positions) && player.tactical.positions.length ? player.tactical.positions.join(", ") : ""],
  ["Overs", player.tactical?.overs != null ? `${player.tactical.overs}` : ""],
];

const buildPhaseDetails = (player) => {
  const battingPhases = [
    ["Powerplay", player.batting?.phases?.powerplay?.rating, player.batting?.phases?.powerplay?.strike_rate],
    ["Middle", player.batting?.phases?.middle?.rating, player.batting?.phases?.middle?.strike_rate],
    ["Death", player.batting?.phases?.death?.rating, player.batting?.phases?.death?.strike_rate],
  ];
  const bowlingPhases = [
    ["Powerplay", player.bowling?.phases?.powerplay],
    ["Middle", player.bowling?.phases?.middle],
    ["Death", player.bowling?.phases?.death],
  ];

  return { battingPhases, bowlingPhases };
};

const PlayerRatingsPanel = ({ player, expanded = false, onClose }) => {
  if (!player) return null;

  const ratings = buildRatings(player);
  const subRatings = buildSubRatings(player);
  const profileStats = buildProfileStats(player);
  const { battingPhases, bowlingPhases } = buildPhaseDetails(player);
  const showBatting = hasBattingStats(player.role);
  const showBowling = hasBowlingStats(player.role);

  return (
    <div className={`rounded-2xl border border-gray-800 bg-gray-900/80 ${expanded ? "h-full p-3" : "p-4"}`}>
      <div className={`${expanded ? "mb-2" : "mb-3"} flex items-center justify-between gap-3`}>
        <div>
          <SectionLabel>Player Ratings</SectionLabel>
          <p className={`${expanded ? "text-xs" : "text-sm"} font-semibold text-white truncate`}>{player.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {typeof player.fitness?.injury_risk === "number" && (
            <p className={`${expanded ? "text-[10px]" : "text-[11px]"} text-gray-500 text-right`}>
              Injury risk <span className="font-semibold text-amber-300">{player.fitness.injury_risk}/10</span>
            </p>
          )}
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
      </div>

      <div className={`grid grid-cols-2 ${expanded ? "gap-1.5" : "gap-2"}`}>
        {ratings.map(([label, value, tone]) => (
          <RatingMetric key={label} label={label} value={value} tone={tone} compact={expanded} />
        ))}
      </div>

      <div className={`${expanded ? "mt-3 space-y-2" : "mt-4 space-y-3"}`}>
        {expanded && (
          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">
              Profile
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {profileStats.map(([label, value]) => (
                <StatChip key={label} label={label} value={value} compact />
              ))}
            </div>
          </div>
        )}

        {expanded && showBatting && (
          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">
              Batting Phases
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {battingPhases.map(([label, rating, strikeRate]) => (
                <div key={label} className="rounded-lg border border-gray-800 bg-gray-950/60 px-2 py-1.5">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
                  <p className="mt-0.5 text-xs font-bold text-blue-200">{rating ?? 0}/10</p>
                  <p className="text-[10px] text-gray-400">SR {strikeRate ?? 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {expanded && showBowling && (
          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">
              Bowling Phases
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {bowlingPhases.map(([label, rating]) => (
                <div key={label} className="rounded-lg border border-gray-800 bg-gray-950/60 px-2 py-1.5">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
                  <p className="mt-0.5 text-xs font-bold text-red-200">{rating ?? 0}/10</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {subRatings.map((section) => (
          <div key={section.title}>
            <p className={`${expanded ? "mb-1.5 text-[9px]" : "mb-2 text-[10px]"} font-bold uppercase tracking-[0.2em] text-gray-500`}>
              {section.title}
            </p>
            <div className={`grid grid-cols-1 ${expanded ? "gap-1.5" : "gap-2"}`}>
              {section.items.map(([label, value, tone]) => (
                <SubRatingRow key={label} label={label} value={value} tone={tone} compact={expanded} />
              ))}
            </div>
          </div>
        ))}
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
  const [showStatsPanel, setShowStatsPanel] = useState(false);
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
    loading: auctionLoading,
    placeBid,
    withdraw,
    refetch,
  } = useAuction();

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

  const openStatsPanel = () => setShowStatsPanel(true);
  const closeStatsPanel = () => setShowStatsPanel(false);

  return (
    <>
      <SoldFlash soldFlash={soldFlash} />

      <div className="flex flex-col bg-ipl-dark lg:overflow-hidden lg:h-[calc(100vh-105px)]">
        <div className="flex-shrink-0 border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-950/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-gray-400 text-sm font-semibold">
                {soldCount} sold · {unsoldCount} unsold
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {amHost && <AuctionControls session={session} onRefetch={refetch} />}
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
          <div className="lg:order-2 lg:col-span-3 border-b lg:border-b-0 lg:border-l border-gray-800 lg:overflow-y-auto lg:h-full">
            <div className="p-5 space-y-5">
              {showStatsPanel && currentPlayer ? (
                <PlayerRatingsPanel player={currentPlayer} expanded onClose={closeStatsPanel} />
              ) : (
                <>
                  {currentPlayer && <PlayerRatingsPanel player={currentPlayer} />}

                  <div>
                    <SectionLabel>{amHost ? "All Teams" : "Other Teams"}</SectionLabel>
                    <OtherTeamsPanel teams={allTeams} myTeamId={myTeam?._id} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="lg:order-1 lg:col-span-2 lg:h-full lg:overflow-y-auto">
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
                      onViewStats={openStatsPanel}
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
