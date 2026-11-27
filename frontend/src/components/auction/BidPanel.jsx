import { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRoom } from '../../context/RoomContext';
import { formatCroreAmount, normalizeCroreAmount } from '../../utils/currency';

const MIN_BID_INCREMENT = 0.2;
const QUICK_BID_STEPS   = [0.2, 0.5, 1];

const getIncrement   = () => MIN_BID_INCREMENT;
const getMinNextBid  = (bid, hasExistingBid) =>
  hasExistingBid ? normalizeCroreAmount(bid + getIncrement()) : normalizeCroreAmount(bid);
const getQuickBids   = (currentBid, hasExistingBid) =>
  (hasExistingBid ? QUICK_BID_STEPS : [0, ...QUICK_BID_STEPS])
    .slice(0, 3)
    .map(step => normalizeCroreAmount(currentBid + step));
const getBidderTeamId = (bidder) => bidder?.id || bidder?._id || null;

// Shared derived state — used by both the "bid" and "withdraw" halves so they
// stay in sync (leading/withdrawn status) without either half depending on the other.
function useBidPanelState({ highestBidder, withdrawnTeams }) {
  const { user }            = useAuth();
  const { teamAssignments } = useRoom();

  const myTeamAssignment = user ? teamAssignments?.[user.id] : null;
  const myTeamId         = myTeamAssignment?.teamId ? String(myTeamAssignment.teamId) : null;
  const bidderTeamId     = getBidderTeamId(highestBidder) ? String(getBidderTeamId(highestBidder)) : null;
  const isLeading        = !!(myTeamId && bidderTeamId && myTeamId === bidderTeamId);
  const hasExistingBid   = !!highestBidder;

  const withdrawnTeamIds = useMemo(
    () => withdrawnTeams.map(t => String(t?._id || t?.id || t)),
    [withdrawnTeams]
  );
  const hasWithdrawn = !!(myTeamId && withdrawnTeamIds.includes(myTeamId));

  return { myTeamAssignment, isLeading, hasExistingBid, hasWithdrawn };
}

export default function BidPanel({
  mode = 'bid',
  currentBid, minNextBid, highestBidder,
  withdrawnTeams = [], currentPlayer, bidError, onBid, onWithdraw,
}) {
  const { myTeamAssignment, isLeading, hasExistingBid, hasWithdrawn } =
    useBidPanelState({ highestBidder, withdrawnTeams });

  const [bidding,     setBidding]     = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const bidTimeoutRef = useRef(null);

  useEffect(() => {
    setBidding(false);
    setWithdrawing(false);
    clearTimeout(bidTimeoutRef.current);
  }, [currentBid, bidError, withdrawnTeams]);

  useEffect(() => () => clearTimeout(bidTimeoutRef.current), []);

  const canBid      = !!currentPlayer && !!myTeamAssignment && !isLeading && !bidding && !hasWithdrawn;
  const canWithdraw = !!currentPlayer && !!myTeamAssignment && !isLeading && !hasWithdrawn && !withdrawing;
  const quickBids   = useMemo(() => getQuickBids(currentBid, hasExistingBid), [currentBid, hasExistingBid]);

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
    return mode === 'bid'
      ? <div className="flex items-center justify-center py-6 px-4">
          <p className="text-white/20 text-xs">Waiting for next player…</p>
        </div>
      : null;
  }

  if (!myTeamAssignment) {
    return mode === 'bid'
      ? <div className="text-center py-4">
          <p className="text-white/25 text-xs">Go to Lobby and pick a team to bid</p>
        </div>
      : null;
  }

  if (mode === 'withdraw') {
    return (
      <div className="max-w-xl mx-auto w-full px-3 py-2 lg:px-4 lg:py-3">
        <button type="button" onClick={handleWithdraw} disabled={!canWithdraw}
          className={`w-full rounded-xl border px-4 py-2.5 lg:py-3 text-sm font-semibold transition
            ${hasWithdrawn
              ? 'border-orange-400/30 bg-orange-400/[0.08] text-orange-300 cursor-default'
              : 'border-white/[0.08] bg-transparent text-white/40 hover:border-bid-red/35 hover:text-bid-red/80 disabled:opacity-30 disabled:cursor-not-allowed'
            }`}>
          {isLeading ? '🔒 Leading bid locked' : hasWithdrawn ? '✓ Withdrawn' : 'Withdraw'}
        </button>

        {withdrawnTeams.length > 0 && (
          <p className="text-[10px] text-white/25 text-center mt-2">
            Withdrawn: {withdrawnTeams.map(t => t.shortName || t.name).join(', ')}
          </p>
        )}
      </div>
    );
  }

  const effectiveMin = minNextBid || (currentBid ? getMinNextBid(currentBid, hasExistingBid) : 0);

  return (
    <div className="flex flex-col gap-2 lg:gap-2.5 max-w-xl mx-auto w-full px-3 py-2 lg:px-4 lg:py-3">

      {bidError && (
        <div className="flex items-center gap-2 bg-bid-red/10 border border-bid-red/25
                        text-bid-red text-xs px-3 py-2 rounded-xl">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {bidError}
        </div>
      )}

      {isLeading && (
        <div className="flex items-center justify-center gap-2 py-1.5 rounded-xl
                        bg-gradient-to-r from-neon/[0.04] via-neon/[0.12] to-neon/[0.04]
                        border border-neon/25 shadow-[0_0_20px_rgb(var(--neon)/.12)]">
          <span className="text-neon font-black text-xs tracking-widest neon-glow">★ YOU'RE LEADING</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        {quickBids.map((amount, i) => (
          <button key={amount} onClick={() => handleQuickBid(amount)} disabled={!canBid}
            className={`flex flex-col items-center py-2.5 lg:py-3.5 rounded-xl font-bold text-sm
                        border transition-all active:scale-95
                        disabled:opacity-30 disabled:cursor-not-allowed
                        ${i === 0
                          ? 'bg-gradient-to-b from-neon to-neon-dim text-black border-transparent shadow-[0_4px_16px_rgb(var(--neon)/.28),inset_0_1px_0_rgba(255,255,255,.35)] hover:brightness-110 hover:shadow-[0_4px_22px_rgb(var(--neon)/.42)]'
                          : 'bg-white/[0.02] text-white border-white/[0.1] hover:border-neon/40 hover:text-neon hover:bg-neon/[0.04]'
                        }`}>
            <span className="font-bebas text-xl leading-none tracking-wider">
              {formatCroreAmount(amount)}
            </span>
            <span className={`text-[9px] font-bold mt-0.5 tracking-widest
                              ${i === 0 ? 'text-black/60' : 'text-white/30'}`}>
              {i === 0 ? (hasExistingBid ? 'MIN BID' : 'BASE') : `+${i} STEP`}
            </span>
            <span className={`hidden lg:inline text-[9px] ${i === 0 ? 'text-black/40' : 'text-white/20'}`}>CR</span>
          </button>
        ))}
      </div>

      <div className="hidden lg:flex items-center justify-between px-0.5">
        <span className="text-[10px] text-white/25">
          Step: <span className="text-white/50">+{formatCroreAmount(getIncrement())} Cr</span>
        </span>
        <span className="text-[10px] text-white/25">
          Min: <span className="text-neon font-semibold">{formatCroreAmount(effectiveMin)} Cr</span>
        </span>
      </div>
    </div>
  );
}
