/**
 * Server-side countdown timer — per-room.
 *
 * Each room gets its own isolated timer state stored in a Map keyed by roomCode.
 * All public functions take roomCode as their first argument.
 */

const EXPIRE_GRACE_MS = 1500;

// Map<roomCode, timerState>
const _states = new Map();

const _getState = (roomCode) => {
  if (!_states.has(roomCode)) {
    _states.set(roomCode, {
      io:         null,
      onExpire:   null,
      timeLeft:   0,
      expiresAt:  0,
      timeout:    null,
      generation: 0,
      duration:   10,
    });
  }
  return _states.get(roomCode);
};

const _clearAll = (s) => {
  clearTimeout(s.timeout);
  s.timeout = null;
};

const _computeTimeLeft = (s) => {
  if (!s.expiresAt) return 0;
  return Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 1000));
};

const _emitTimer = (s, roomCode) => {
  s.timeLeft = _computeTimeLeft(s);
  // Include serverNow so clients can correct for local clock skew
  s.io?.to(roomCode).emit('auction:timer', { timeLeft: s.timeLeft, expiresAt: s.expiresAt, serverNow: Date.now() });
};

const _run = (roomCode, seconds) => {
  const s = _getState(roomCode);
  _clearAll(s);
  s.generation += 1;
  const gen    = s.generation;
  s.timeLeft   = seconds;
  s.expiresAt  = Date.now() + seconds * 1000;

  _emitTimer(s, roomCode);

  s.timeout = setTimeout(async () => {
    _clearAll(s);
    s.timeLeft = 0;
    s.io?.to(roomCode).emit('auction:timer', { timeLeft: 0, expiresAt: s.expiresAt, serverNow: Date.now() });

    await new Promise((resolve) => setTimeout(resolve, EXPIRE_GRACE_MS));

    if (s.generation !== gen) return;

    if (s.onExpire) {
      try { await s.onExpire(); }
      catch (err) { console.error('[auctionTimer] onExpire error:', err.message); }
    }

    s.expiresAt = 0;
  }, seconds * 1000);
};

// ── Public API (all take roomCode first) ────────────────────────────────────

const start = (roomCode, io, duration, onExpire) => {
  const s   = _getState(roomCode);
  s.io      = io;
  s.onExpire = onExpire;
  s.duration = duration;
  _run(roomCode, duration);
};

const holdGrace = (roomCode, now = Date.now()) => {
  const s = _getState(roomCode);
  if (s.timeout !== null) return true;
  if (!s.expiresAt || now > s.expiresAt + EXPIRE_GRACE_MS) return false;
  s.generation += 1;
  return true;
};

const releaseGrace = (roomCode) => {
  const s = _getState(roomCode);
  if (!s.expiresAt && s.timeout === null) return; // nothing to release
  // Restart a short window instead of firing onExpire immediately.
  // This lets other teams bid before the auction closes.
  // If no bid comes in and extends the timer, onExpire fires after EXPIRE_GRACE_MS.
  _run(roomCode, EXPIRE_GRACE_MS / 1000);
};

const extend = (roomCode, asOf = Date.now()) => {
  const s = _getState(roomCode);
  if (!s.timeout) {
    if (!s.expiresAt || asOf > s.expiresAt + EXPIRE_GRACE_MS) return;
  }
  _run(roomCode, s.duration);
};

const stop = (roomCode) => {
  const s = _getState(roomCode);
  _clearAll(s);
  s.onExpire  = null;
  s.timeLeft  = 0;
  s.expiresAt = 0;
};

const getTimeLeft  = (roomCode) => _computeTimeLeft(_getState(roomCode));
const getExpiresAt = (roomCode) => _getState(roomCode).expiresAt;
const isRunning    = (roomCode) => _getState(roomCode).timeout !== null;

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
