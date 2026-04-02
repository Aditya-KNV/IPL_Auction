/**
 * Bid rules (all values in Crores).
 *
 * Minimum legal raise: +0.2 Cr (20 Lakhs)
 * Quick bid buttons:   +0.2 Cr, +0.5 Cr, +1 Cr
 */

const MIN_BID_INCREMENT = 0.2;
const QUICK_BID_STEPS = [0.2, 0.5, 1];
const normalizeBidAmount = (amount) => Number(Number(amount || 0).toFixed(2));

/**
 * Returns the minimum raise increment for a given bid.
 * @param {number} currentBid - in Crores
 */
const getBidIncrement = () => MIN_BID_INCREMENT;

/**
 * Returns the lowest amount a new bid may be.
 */
const getMinNextBid = (currentBid, hasExistingBid = false) =>
  hasExistingBid
    ? normalizeBidAmount(currentBid + getBidIncrement(currentBid))
    : normalizeBidAmount(currentBid);

/**
 * Returns true when proposedBid is a valid raise over currentBid.
 */
const isValidBid = (currentBid, proposedBid, hasExistingBid = false) =>
  Number.isFinite(proposedBid) &&
  normalizeBidAmount(proposedBid) >= getMinNextBid(currentBid, hasExistingBid);

/**
 * Returns up to `count` quick bid options above currentBid.
 */
const getQuickBids = (currentBid, count = 3, hasExistingBid = false) => {
  const steps = hasExistingBid ? QUICK_BID_STEPS : [0, ...QUICK_BID_STEPS];
  return steps.slice(0, count).map((step) => normalizeBidAmount(currentBid + step));
};

module.exports = { getBidIncrement, getMinNextBid, isValidBid, getQuickBids, normalizeBidAmount, QUICK_BID_STEPS };
