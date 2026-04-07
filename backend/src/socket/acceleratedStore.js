/**
 * In-memory state for accelerated auction mode — per-room.
 *
 * All state is keyed by roomCode so concurrent rooms never share data.
 */

/** @type {Map<string, { players, maxPicks, picks, submittedTeamIds, expectedTeamIds }>} */
const _selections = new Map();

/** @type {Map<string, Set<string>>} Active pool during accelerated auction. */
const _pools = new Map();

/* ── Selection phase ─────────────────────────────────────────────────────── */

const initSelection = (roomCode, players, assignedTeamIds, maxPicks) => {
  _selections.set(roomCode, {
    players,
    maxPicks,
    picks:            {},
    submittedTeamIds: new Set(),
    expectedTeamIds:  new Set(assignedTeamIds.map(String)),
  });
};

/** Record a team's picks. Returns { ok } or { error }. */
const submitPicks = (roomCode, teamId, picks) => {
  const sel = _selections.get(roomCode);
  if (!sel) return { error: 'No active selection for this room' };
  const tid = String(teamId);
  if (!sel.expectedTeamIds.has(tid)) return { error: 'Your team is not in this room' };
  const max = sel.maxPicks ?? 7;
  if (picks.length > max) return { error: `Maximum ${max} players allowed` };
  sel.picks[tid] = picks.map(String);
  sel.submittedTeamIds.add(tid);
  return { ok: true };
};

/** Build deduplicated pool from all submitted picks. */
const buildPool = (roomCode) => {
  const sel = _selections.get(roomCode);
  if (!sel) return new Set();
  const all = new Set();
  for (const ids of Object.values(sel.picks)) {
    for (const id of ids) all.add(id);
  }
  return all;
};

/** Serialisable snapshot for broadcasting. Returns null if no selection open. */
const getSelectionSnapshot = (roomCode) => {
  const sel = _selections.get(roomCode);
  if (!sel) return null;
  const submittedTeamIds = [...sel.submittedTeamIds];
  const expectedTeamIds  = [...sel.expectedTeamIds];
  return {
    players:          sel.players,
    maxPicks:         sel.maxPicks,
    submittedTeamIds,
    expectedTeamIds,
    allSubmitted:
      expectedTeamIds.length === 0 ||
      submittedTeamIds.length >= expectedTeamIds.length,
  };
};

const clearSelection = (roomCode) => _selections.delete(roomCode);

/* ── Running phase ───────────────────────────────────────────────────────── */

const setPool   = (roomCode, pool) => _pools.set(roomCode, pool);
const getPool   = (roomCode)       => _pools.get(roomCode) ?? null;
const clearPool = (roomCode)       => _pools.delete(roomCode);

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const isSelectionOpen = (roomCode) => _selections.has(roomCode);
const isPoolActive    = (roomCode) => _pools.has(roomCode);

/** Full reset for a room — call on auction end or server recovery. */
const reset = (roomCode) => {
  _selections.delete(roomCode);
  _pools.delete(roomCode);
};

module.exports = {
  initSelection,
  submitPicks,
  buildPool,
  getSelectionSnapshot,
  clearSelection,
  setPool,
  getPool,
  clearPool,
  isSelectionOpen,
  isPoolActive,
  reset,
};
