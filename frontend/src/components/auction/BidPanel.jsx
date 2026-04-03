import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRoom } from '../../context/RoomContext';
import { formatCroreAmount, normalizeCroreAmount } from '../../utils/currency';

const MIN_BID_INCREMENT = 0.2;
const QUICK_BID_STEPS = [0.2, 0.5, 1];

const getIncrement = () => MIN_BID_INCREMENT;
const getMinNextBid = (bid, hasExistingBid) =>
  hasExistingBid ? normalizeCroreAmount(bid + getIncrement(bid)) : normalizeCroreAmount(bid);
const getQuickBids = (currentBid, hasExistingBid) =>
  (hasExistingBid ? QUICK_BID_STEPS : [0, ...QUICK_BID_STEPS])
    .slice(0, 3)
    .map((step) => normalizeCroreAmount(currentBid + step));
const getBidderTeamId = (bidder) => bidder?.id || bidder?._id || null;

export default function BidPanel({
  currentBid,
  minNextBid,
  highestBidder,
  withdrawnTeams = [],
  currentPlayer,
  bidError,
  onBid,
  onWithdraw,
}) {
  const { user } = useAuth();
  const { teamAssignments } = useRoom();
  const [bidding, setBidding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const bidTimeoutRef = useRef(null);

  const myTeamAssignment = user ? teamAssignments?.[user.id] : null;
  const myTeamId = myTeamAssignment?.teamId ? String(myTeamAssignment.teamId) : null;
  const bidderTeamId = getBidderTeamId(highestBidder) ? String(getBidderTeamId(highestBidder)) : null;
  const isLeading = !!(myTeamId && bidderTeamId && myTeamId === bidderTeamId);
  const hasExistingBid = !!highestBidder;
  const withdrawnTeamIds = useMemo(
    () => withdrawnTeams.map((team) => String(team?._id || team?.id || team)),
    [withdrawnTeams]
  );
  const hasWithdrawn = !!(myTeamId && withdrawnTeamIds.includes(myTeamId));

  useEffect(() => {
    setBidding(false);
    setWithdrawing(false);
    clearTimeout(bidTimeoutRef.current);
  }, [currentBid, bidError, withdrawnTeams]);

  useEffect(() => () => clearTimeout(bidTimeoutRef.current), []);

  const canBid = !!currentPlayer && !!myTeamAssignment && !isLeading && !bidding && !hasWithdrawn;
  const canWithdraw = !!currentPlayer && !!myTeamAssignment && !hasWithdrawn && !withdrawing;
  const quickBids = useMemo(() => getQuickBids(currentBid, hasExistingBid), [currentBid, hasExistingBid]);
  const effectiveMin = minNextBid || (currentBid ? getMinNextBid(currentBid, hasExistingBid) : 0);

  const handleQuickBid = (amount) => {
    if (!canBid) return;
    setBidding(true);
    clearTimeout(bidTimeoutRef.current);
    bidTimeoutRef.current = setTimeout(() => setBidding(false), 1500);
    onBid(amount);
  };

  const handleWithdraw = () => {
    if (!canWithdraw) return;
    setWithdrawing(true);
    onWithdraw();
  };

  if (!currentPlayer) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-8 flex flex-col items-center gap-2">
        <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-600 text-sm">Waiting for next player</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bidError && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30 text-red-400 text-sm px-3 py-2.5 rounded-xl">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {bidError}
        </div>
      )}

      {myTeamAssignment ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {quickBids.map((amount, i) => (
              <button
                key={amount}
                onClick={() => handleQuickBid(amount)}
                disabled={!canBid}
                className={`flex flex-col items-center py-3 rounded-xl font-bold text-sm border transition-all
                  disabled:opacity-30 disabled:cursor-not-allowed
                  ${
                    i === 0
                      ? 'bg-ipl-gold text-gray-950 border-ipl-gold hover:brightness-110 active:scale-95'
                      : 'bg-transparent text-white border-gray-700 hover:border-ipl-gold/60 hover:text-ipl-gold active:scale-95'
                  }`}
              >
                <span className="text-base font-black leading-none">Rs {formatCroreAmount(amount)}</span>
                <span className={`text-[10px] font-semibold mt-0.5 tracking-wider ${i === 0 ? 'text-gray-900/70' : 'text-gray-500'}`}>
                  {i === 0 ? (hasExistingBid ? 'MIN BID' : 'BASE PRICE') : `+${i} STEP${i > 1 ? 'S' : ''}`}
                </span>
                <span className={`text-[10px] ${i === 0 ? 'text-gray-900/50' : 'text-gray-600'}`}>Cr</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] text-gray-600">
              Step: <span className="text-gray-400">+Rs {formatCroreAmount(getIncrement(currentBid))} Cr</span>
            </span>
            <span className="text-[11px] text-gray-600">
              Min: <span className="text-ipl-gold font-semibold">Rs {formatCroreAmount(effectiveMin)} Cr</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleWithdraw}
            disabled={!canWithdraw}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              hasWithdrawn
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 cursor-default'
                : 'border-gray-700 bg-gray-900 text-gray-200 hover:border-red-500/50 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {hasWithdrawn ? 'Withdrawn for this player' : 'Withdraw'}
          </button>

          {withdrawnTeams.length > 0 && (
            <p className="text-xs text-gray-500">
              Withdrawn: {withdrawnTeams.map((team) => team.shortName || team.name).join(', ')}
            </p>
          )}
        </>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-5 text-center">
          <p className="text-gray-500 text-sm">Go to Lobby and pick a team to bid</p>
        </div>
      )}
    </div>
  );
}
