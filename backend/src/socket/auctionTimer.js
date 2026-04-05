/**
 * Server-side countdown timer for the live auction.
 *
 * Singleton - one active timer at a time.
 *
 * Responsibilities:
 *  - Emit auction:timer { timeLeft, expiresAt } at key moments only
 *    (start / extend / expire).  Clients drive their own visual countdown
 *    from expiresAt — no server-side polling interval needed.
 *  - Call onExpire() when the clock hits zero
 *  - Expose extend() so a new bid resets the clock to the session's timerDuration
 *  - Expose stop() so manual sold/unsold cancels the auto-expire
 */

// Must be longer than the worst-case bid processing time (5 DB queries).
// If extend() is called within this window after timer fires, expire is cancelled.
const EXPIRE_GRACE_MS = 1500;

let _io         = null;
let _onExpire   = null;
let _timeLeft   = 0;
let _expiresAt  = 0;
let _timeout    = null;
let _generation = 0;
let _duration   = 10; // tracks current session duration; updated on every start()

// ── Private ───────────────────────────────────────────────────────────────────

const _clearAll = () => {
  clearTimeout(_timeout);
  _timeout = null;
};

const _computeTimeLeft = () => {
  if (!_expiresAt) return 0;
  return Math.max(0, Math.ceil((_expiresAt - Date.now()) / 1000));
};

// Emit a single timer snapshot — clients recompute remaining time from
// expiresAt using their local clock, so one push per event is enough.
const _emitTimer = () => {
  _timeLeft = _computeTimeLeft();
  _io?.emit('auction:timer', { timeLeft: _timeLeft, expiresAt: _expiresAt });
};

const _run = (seconds) => {
  _clearAll();
  _generation += 1;
  const gen  = _generation;
  _timeLeft  = seconds;
  _expiresAt = Date.now() + seconds * 1000;

  // Tell every client the new expiry; they drive their own visual countdown.
  _emitTimer();

  _timeout = setTimeout(async () => {
    _clearAll();
    _timeLeft = 0;
    _io?.emit('auction:timer', { timeLeft: 0, expiresAt: _expiresAt });

    // Grace period: a bid that arrived just before the deadline may still call
    // extend() within this window — that bumps _generation and aborts the expiry.
    await new Promise((resolve) => setTimeout(resolve, EXPIRE_GRACE_MS));

    if (_generation !== gen) return;

    if (_onExpire) {
      try {
        await _onExpire();
      } catch (err) {
        console.error('[auctionTimer] onExpire error:', err.message);
      }
    }

    _expiresAt = 0;
  }, seconds * 1000);
};

// ── Public API ────────────────────────────────────────────────────────────────

const start = (io, duration, onExpire) => {
  _io       = io;
  _onExpire = onExpire;
  _duration = duration; // remember so extend() uses the same window
  _run(duration);
};

/**
 * holdGrace(now) — call this BEFORE any async work when a bid arrives after
 * the timer has already fired but within the grace window.
 *
 * Bumps _generation so the pending _onExpire callback aborts its generation
 * check and never calls executeSale.  The caller is then responsible for
 * either:
 *   • calling extend(now) on a successful bid, OR
 *   • calling releaseGrace() if the bid fails validation (to trigger expiry).
 *
 * Returns true  → grace held, caller must follow up.
 * Returns false → outside grace window, bid must be rejected.
 */
const holdGrace = (now = Date.now()) => {
  if (_timeout !== null) return true;  // timer still running — nothing to hold
  if (!_expiresAt || now > _expiresAt + EXPIRE_GRACE_MS) return false;
  _generation += 1; // aborts the pending _onExpire generation check
  return true;
};

/**
 * releaseGrace() — call this when a grace-held bid fails DB validation.
 * Triggers the expiry that was blocked by holdGrace() so the player is sold
 * to the previous highest bidder as if the bid never arrived.
 */
const releaseGrace = async () => {
  _expiresAt = 0;
  if (_onExpire) {
    try { await _onExpire(); } catch (err) {
      console.error('[auctionTimer] releaseGrace onExpire error:', err.message);
    }
  }
};

/**
 * extend(asOf) — resets the countdown to _duration seconds.
 * asOf should be the timestamp captured at the START of the bid handler
 * (before any DB work) so that DB latency cannot push us past the grace
 * window and silently prevent the extension.
 */
const extend = (asOf = Date.now()) => {
  if (!_timeout) {
    if (!_expiresAt || asOf > _expiresAt + EXPIRE_GRACE_MS) return;
  }
  _run(_duration);
};

const stop = () => {
  _clearAll();
  _onExpire  = null;
  _timeLeft  = 0;
  _expiresAt = 0;
};

const getTimeLeft  = () => _computeTimeLeft();
const getExpiresAt = () => _expiresAt;
const isRunning    = () => _timeout !== null;

module.exports = {
  start,
  holdGrace,
  releaseGrace,
  extend,
  stop,
  getTimeLeft,
  getExpiresAt,
  isRunning,
  EXPIRE_GRACE_MS,
};
