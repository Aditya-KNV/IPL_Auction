/**
 * In-memory room registry.
 *
 * Room shape:
 * {
 *   code:            string,
 *   hostId:          string | null,  // socket.id of CONNECTED host (null while host is offline)
 *   hostUserId:      string,         // userId of the current/pending host — persists across reconnects
 *   users:           Map<socketId, { socketId, userId, username }>,
 *   teamAssignments: Map<userId, { teamId, name, shortName, color, claimedBy }>,
 *   createdAt:       Date,
 * }
 *
 * Host grace logic:
 *   When the host disconnects, hostId is set to null but hostUserId is kept.
 *   A 3-minute timer starts. If the host reconnects in time, their new socket
 *   is promoted back to host and the timer is cancelled.
 *   If the timer fires, the first connected user is promoted.
 */

const crypto = require('crypto');

const rooms             = new Map();
const socketToRoom      = new Map();
const roomCleanupTimers = new Map();
const hostTransferTimers = new Map(); // code → setTimeout handle

const EMPTY_ROOM_TTL_MS   = 12 * 60 * 60 * 1000;
const HOST_GRACE_MS        =  3 * 60 * 1000;       // 3 minutes

const generateCode = () => {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(crypto.randomBytes(6))
      .map((b) => CHARS[b % CHARS.length])
      .join('');
  } while (rooms.has(code));
  return code;
};

const serializeRoom = (room) => ({
  code:        room.code,
  hostId:      room.hostId,
  hostUserId:  room.hostUserId,
  users:       [...room.users.values()],
  teamAssignments: Object.fromEntries(room.teamAssignments),
  createdAt:   room.createdAt,
});

// ── Room cleanup (empty room TTL) ─────────────────────────────────────────────

const cancelRoomCleanup = (code) => {
  const t = roomCleanupTimers.get(code);
  if (!t) return;
  clearTimeout(t);
  roomCleanupTimers.delete(code);
};

const scheduleRoomCleanup = (code) => {
  cancelRoomCleanup(code);
  const t = setTimeout(() => {
    const room = rooms.get(code);
    if (!room || room.users.size > 0) return;
    rooms.delete(code);
    roomCleanupTimers.delete(code);
  }, EMPTY_ROOM_TTL_MS);
  roomCleanupTimers.set(code, t);
};

// ── Host transfer (grace period) ──────────────────────────────────────────────

const cancelHostTransfer = (code) => {
  const t = hostTransferTimers.get(code);
  if (!t) return;
  clearTimeout(t);
  hostTransferTimers.delete(code);
};

/**
 * Start the 3-minute grace window after the host disconnects.
 * onTransfer(code, serializedRoom) is called if the timer fires.
 */
const scheduleHostTransfer = (code, onTransfer) => {
  cancelHostTransfer(code);
  const t = setTimeout(() => {
    hostTransferTimers.delete(code);
    const room = rooms.get(code);
    if (!room || room.users.size === 0) return; // room empty — nothing to do

    // Promote the first connected user
    const [newSocketId] = room.users.keys();
    const newUser       = room.users.get(newSocketId);
    room.hostId         = newSocketId;
    room.hostUserId     = newUser.userId;

    console.log(`[room] host grace expired for ${code} — promoted ${newUser.username}`);
    if (onTransfer) onTransfer(code, serializeRoom(room));
  }, HOST_GRACE_MS);
  hostTransferTimers.set(code, t);
};

// ── Core operations ───────────────────────────────────────────────────────────

const createRoom = (socketId, userId, username) => {
  const code = generateCode();
  const room = {
    code,
    hostId:     socketId,
    hostUserId: userId,
    users:      new Map([[socketId, { socketId, userId, username }]]),
    teamAssignments: new Map(),
    createdAt:  new Date(),
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return serializeRoom(room);
};

const joinRoom = (code, socketId, userId, username) => {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.users.has(socketId)) return { error: 'Already in this room' };

  cancelRoomCleanup(code);

  // Remove any stale socket entry for this userId (handles reconnect)
  for (const [existingSocketId, existingUser] of room.users.entries()) {
    if (existingUser.userId === userId) {
      room.users.delete(existingSocketId);
      socketToRoom.delete(existingSocketId);
    }
  }

  room.users.set(socketId, { socketId, userId, username });
  socketToRoom.set(socketId, code);

  // Restore host if this is the pending host reconnecting
  if (userId === room.hostUserId) {
    cancelHostTransfer(code);
    room.hostId = socketId;
    console.log(`[room] host ${username} reconnected to ${code} — host restored`);
  }

  // If room was empty (everyone had left), this person becomes host
  if (room.users.size === 1) {
    room.hostId     = socketId;
    room.hostUserId = userId;
  }

  return { room: serializeRoom(room) };
};

/**
 * Called on socket disconnect.
 * If the host disconnects, starts the 3-minute grace window instead of
 * immediately transferring host. onHostTransfer is called if it expires.
 */
const leaveRoom = (socketId, { onHostTransfer } = {}) => {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  const wasHost = room.hostId === socketId;

  room.users.delete(socketId);
  socketToRoom.delete(socketId);

  if (room.users.size === 0) {
    cancelHostTransfer(code);
    scheduleRoomCleanup(code);
    return null;
  }

  if (wasHost) {
    // Don't transfer yet — set hostId to null and wait HOST_GRACE_MS
    room.hostId = null;
    scheduleHostTransfer(code, onHostTransfer);
    console.log(`[room] host disconnected from ${code} — ${HOST_GRACE_MS / 1000}s grace started`);
  }

  return serializeRoom(room);
};

/**
 * Called on explicit room:leave.
 * Explicit leave still uses the same grace window — user may have hit
 * leave by mistake and could rejoin within 3 minutes.
 */
const leaveRoomExplicit = (socketId, { releaseTeam = false, onHostTransfer } = {}) => {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  const userEntry = room?.users.get(socketId);
  if (releaseTeam && userEntry) room.teamAssignments.delete(userEntry.userId);

  return leaveRoom(socketId, { onHostTransfer });
};

const pickTeam = (socketId, teamInfo) => {
  const code = socketToRoom.get(socketId);
  if (!code) return { error: 'Not in a room' };

  const room   = rooms.get(code);
  const socket = room?.users.get(socketId);
  if (!room || !socket) return { error: 'Not in a room' };

  const { userId } = socket;

  for (const [uid, info] of room.teamAssignments) {
    if (info.teamId === teamInfo.teamId && uid !== userId) {
      return { error: `${info.claimedBy} already picked ${info.shortName}` };
    }
  }

  room.teamAssignments.set(userId, { ...teamInfo, claimedBy: socket.username });
  return { room: serializeRoom(room) };
};

const transferHost = (fromSocketId, toSocketId) => {
  const code = socketToRoom.get(fromSocketId);
  if (!code) return { error: 'Not in a room' };

  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.hostId !== fromSocketId) return { error: 'Only the host can transfer host' };
  if (!room.users.has(toSocketId)) return { error: 'Target user is not in the room' };

  const newUser    = room.users.get(toSocketId);
  room.hostId      = toSocketId;
  room.hostUserId  = newUser.userId;
  cancelHostTransfer(code); // cancel any pending grace timer
  return { room: serializeRoom(room) };
};

const getRoom          = (code)     => { const r = rooms.get(code); return r ? serializeRoom(r) : null; };
const getRoomBySocket  = (socketId) => { const code = socketToRoom.get(socketId); return code ? getRoom(code) : null; };
const getRawRoom       = (socketId) => { const code = socketToRoom.get(socketId); return code ? rooms.get(code) : null; };
const getRawRoomByCode = (code)     => rooms.get(code) ?? null;
const roomExists       = (code)     => rooms.has(code);

const getRawRoomByUserId = (userId) => {
  for (const room of rooms.values()) {
    if (room.teamAssignments.has(userId)) return room;
  }
  return null;
};

const getAssignedTeamIds = (roomCode) => {
  const assignedTeamIds = new Set();
  const targets = roomCode
    ? (rooms.get(roomCode) ? [rooms.get(roomCode)] : [])
    : [...rooms.values()];
  for (const room of targets) {
    for (const user of room.users.values()) {
      const assignment = room.teamAssignments.get(user.userId);
      if (assignment?.teamId) assignedTeamIds.add(String(assignment.teamId));
    }
  }
  return [...assignedTeamIds];
};

const isUserHost = (userId) => {
  for (const room of rooms.values()) {
    if (room.hostUserId === String(userId)) return true;
  }
  return false;
};

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  leaveRoomExplicit,
  pickTeam,
  transferHost,
  getRoom,
  getRoomBySocket,
  getRawRoom,
  getRawRoomByCode,
  getRawRoomByUserId,
  getAssignedTeamIds,
  roomExists,
  isUserHost,
};
