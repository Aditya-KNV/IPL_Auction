/**
 * Server-side countdown timer for the live auction.
 *
 * Singleton - one active timer at a time.
 *
 * Responsibilities:
 *  - Emit auction:timer { timeLeft, expiresAt } frequently to all clients
 *  - Call onExpire() when the clock hits zero
 *  - Expose extend() so a new bid resets the clock to EXTENSION_SECS
 *  - Expose stop() so manual sold/unsold cancels the auto-expire
 */

const EXTENSION_SECS = 10;
// Must be longer than the worst-case bid processing time (5 DB queries).
// If extend() is called within this window after timer fires, expire is cancelled.
const EXPIRE_GRACE_MS = 1500;

let _io = null;
let _onExpire = null;
let _timeLeft = 0;
let _expiresAt = 0;
let _timeout = null;
let _interval = null;
let _generation = 0;

const _clearAll = () => {
  clearTimeout(_timeout);
  clearInterval(_interval);
  _timeout = null;
  _interval = null;
};

const _computeTimeLeft = () => {
  if (!_expiresAt) return 0;
  return Math.max(0, Math.ceil((_expiresAt - Date.now()) / 1000));
};

const _emitTimer = () => {
  _timeLeft = _computeTimeLeft();
  _io?.emit('auction:timer', { timeLeft: _timeLeft, expiresAt: _expiresAt });
};

const _run = (seconds) => {
  _clearAll();
  _generation += 1;
  const gen = _generation;
  _timeLeft = seconds;
  _expiresAt = Date.now() + seconds * 1000;

  _emitTimer();
  _interval = setInterval(_emitTimer, 250);

  _timeout = setTimeout(async () => {
    _clearAll();
    _timeLeft = 0;
    _io?.emit('auction:timer', { timeLeft: 0, expiresAt: _expiresAt });

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

const start = (io, duration, onExpire) => {
  _io = io;
  _onExpire = onExpire;
  _run(duration);
};

const extend = () => {
  if (!_timeout) {
    if (!_expiresAt || Date.now() > _expiresAt + EXPIRE_GRACE_MS) return;
  }
  _run(EXTENSION_SECS);
};

const stop = () => {
  _clearAll();
  _onExpire = null;
  _timeLeft = 0;
  _expiresAt = 0;
};

const getTimeLeft = () => _computeTimeLeft();
const getExpiresAt = () => _expiresAt;
const isRunning = () => _timeout !== null;

module.exports = { start, extend, stop, getTimeLeft, getExpiresAt, isRunning, EXTENSION_SECS };
