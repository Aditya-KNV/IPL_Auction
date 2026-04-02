/**
 * Server-side countdown timer for the live auction.
 *
 * Singleton — one active timer at a time.
 *
 * Responsibilities:
 *  - Emit  auction:timer  { timeLeft }  every second to all clients
 *  - Call  onExpire()  when the clock hits zero
 *  - Expose  extend()  so a new bid resets the clock to EXTENSION_SECS
 *  - Expose  stop()    so manual sold/unsold cancels the auto-expire
 */

const EXTENSION_SECS = 5; // extra seconds granted after every new bid

let _io        = null;
let _onExpire  = null;
let _timeLeft  = 0;
let _interval  = null;
let _timeout   = null;

// ── Private ───────────────────────────────────────────────────────────────────

const _clearAll = () => {
  clearInterval(_interval); _interval = null;
  clearTimeout(_timeout);   _timeout  = null;
};

const _run = (seconds) => {
  _clearAll();
  _timeLeft = seconds;

  // Tick every second
  _interval = setInterval(() => {
    _timeLeft = Math.max(0, _timeLeft - 1);
    _io?.emit('auction:timer', { timeLeft: _timeLeft });
  }, 1000);

  // Expire after `seconds`
  _timeout = setTimeout(async () => {
    _clearAll();
    _timeLeft = 0;
    _io?.emit('auction:timer', { timeLeft: 0 });
    if (_onExpire) {
      try {
        await _onExpire();
      } catch (err) {
        console.error('[auctionTimer] onExpire error:', err.message);
      }
    }
  }, seconds * 1000);
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the countdown.
 * @param {import('socket.io').Server} io
 * @param {number}   duration    seconds for the initial window
 * @param {Function} onExpire    async callback invoked when time runs out
 */
const start = (io, duration, onExpire) => {
  _io       = io;
  _onExpire = onExpire;
  _run(duration);
  io.emit('auction:timer', { timeLeft: duration });
};

/**
 * Extend the clock after a new bid (resets to EXTENSION_SECS).
 * No-op if the timer isn't running.
 */
const extend = () => {
  if (!_interval && !_timeout) return; // timer not active
  _run(EXTENSION_SECS);
  _io?.emit('auction:timer', { timeLeft: EXTENSION_SECS });
};

/**
 * Cancel the timer (called when auctioneer manually sells/unsells or pauses).
 */
const stop = () => {
  _clearAll();
  _onExpire = null;
  _timeLeft = 0;
};

const getTimeLeft = () => _timeLeft;
const isRunning   = () => _interval !== null;

module.exports = { start, extend, stop, getTimeLeft, isRunning, EXTENSION_SECS };
