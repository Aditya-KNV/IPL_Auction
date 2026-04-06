/**
 * In-memory state for accelerated auction mode.
 *
 * Phase 1 — Selection: host opens it, each assigned team owner picks up to 7
 *   players from the unsold/available pool.
 * Phase 2 — Running: only players whose IDs are in _pool are auctioned.
 *   Normal pickRandomPlayer is replaced by a pool-filtered pick.
 */

/** @type {{ players: object[], picks: Record<string,string[]>, submittedTeamIds: Set<string>, expectedTeamIds: Set<string> } | null} */
let _selection = null;

/** @type {Set<string> | null} Active during accelerated auction. */
let _pool = null;

/* ── Selection phase ─────────────────────────────────────────────────────── */

const initSelection = (players, assignedTeamIds, maxPicks) => {
  _selection = {
    players,
    maxPicks,
    picks: {},
    submittedTeamIds: new Set(),
    expectedTeamIds: new Set(assignedTeamIds.map(String)),
  };
};

/**
 * Record a team's picks. Returns { ok } or { error }.
 */
const submitPicks = (teamId, picks) => {
  if (!_selection) return { error: 'No active selection' };
  const tid = String(teamId);
  if (!_selection.expectedTeamIds.has(tid)) return { error: 'Your team is not in this room' };
  const max = _selection.maxPicks ?? 7;
  if (picks.length > max) return { error: `Maximum ${max} players allowed` };
  _selection.picks[tid] = picks.map(String);
  _selection.submittedTeamIds.add(tid);
  return { ok: true };
};

/**
 * Build the deduplicated pool from all submitted picks.
 * @returns {Set<string>}
 */
const buildPool = () => {
  if (!_selection) return new Set();
  const all = new Set();
  for (const ids of Object.values(_selection.picks)) {
    for (const id of ids) all.add(id);
  }
  return all;
};

/**
 * Serialisable snapshot of the current selection state.
 * Returns null if no selection is open.
 */
const getSelectionSnapshot = () => {
  if (!_selection) return null;
  const submittedTeamIds = [..._selection.submittedTeamIds];
  const expectedTeamIds  = [..._selection.expectedTeamIds];
  return {
    players:          _selection.players,
    maxPicks:         _selection.maxPicks,
    submittedTeamIds,
    expectedTeamIds,
    allSubmitted:
      expectedTeamIds.length === 0 ||
      submittedTeamIds.length >= expectedTeamIds.length,
  };
};

const clearSelection = () => { _selection = null; };

/* ── Running phase ───────────────────────────────────────────────────────── */

const setPool    = (pool) => { _pool = pool; };
const getPool    = ()     => _pool;
const clearPool  = ()     => { _pool = null; };

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const isSelectionOpen = () => _selection !== null;
const isPoolActive    = () => _pool !== null;

/** Full reset — call on auction:end or server restart recovery. */
const reset = () => {
  _selection = null;
  _pool      = null;
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
