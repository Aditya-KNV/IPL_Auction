import React from "react";
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
import MyTeamPanel from "./MyTeamPanel";
import OtherTeamsPanel from "./OtherTeamsPanel";

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
    timeLeft,
    bidHistory,
    bidError,
    soldFlash,
    loading: auctionLoading,
    placeBid,
    refetch,
  } = useAuction();

  const { myTeam, allTeams, squadByRole, loading: teamLoading } = useMyTeam();

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
      <SoldFlash soldFlash={soldFlash} />

      <div className="flex flex-col bg-ipl-dark lg:overflow-hidden lg:h-[calc(100vh-105px)]">
        <div className="flex-shrink-0 border-b border-gray-800 px-6 py-3 flex items-center justify-between bg-gray-950/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-black text-ipl-gold leading-none">IPL Auction</h1>
              <p className="text-gray-600 text-xs mt-0.5">
                {soldCount} sold · {unsoldCount} unsold
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              {myTeamAssignment && (
                <div>
                  <SectionLabel>My Team</SectionLabel>
                  <MyTeamPanel team={myTeam} squadByRole={squadByRole} />
                </div>
              )}

              <div>
                <SectionLabel>{amHost ? "All Teams" : "Other Teams"}</SectionLabel>
                <OtherTeamsPanel teams={allTeams} myTeamId={myTeam?._id} />
              </div>
            </div>
          </div>

          <div className="lg:order-1 lg:col-span-2 lg:h-full lg:overflow-y-auto">
            <div className="p-5 space-y-4">
              <div className="rounded-3xl p-4 space-y-4 transition-all duration-300">
                <div>
                  <SectionLabel>Up for Auction</SectionLabel>
                  {currentPlayer ? (
                    <PlayerCard player={currentPlayer} currentBid={currentBid} highlighted compact />
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
                      totalDuration={session?.timerDuration || 30}
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
                currentPlayer={currentPlayer}
                timeLeft={timeLeft}
                bidError={bidError}
                onBid={placeBid}
              />

              {(currentPlayer || bidHistory.length > 0) && (
                <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4">
                  <SectionLabel>Bid History</SectionLabel>
                  <BidFeed bids={bidHistory} highestBidder={highestBidder} />
                </div>
              )}

              {amHost && <AuctionControls session={session} onRefetch={refetch} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
