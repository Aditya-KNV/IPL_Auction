/**
 * In-memory room registry.
 *
 * Room shape:
 * {
 *   code:            string,
 *   hostId:          string, // socket.id of current host
 *   users:           Map<socketId, { socketId, userId, username }>,
 *   teamAssignments: Map<userId, { teamId, name, shortName, color }>,
 *   createdAt:       Date,
 * }
 */

const crypto = require('crypto');

const rooms = new Map();
const socketToRoom = new Map();
const roomCleanupTimers = new Map();
const EMPTY_ROOM_TTL_MS = 12 * 60 * 60 * 1000;

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
  code: room.code,
  hostId: room.hostId,
  users: [...room.users.values()],
  teamAssignments: Object.fromEntries(room.teamAssignments),
  createdAt: room.createdAt,
});

const cancelRoomCleanup = (code) => {
  const timer = roomCleanupTimers.get(code);
  if (!timer) return;
  clearTimeout(timer);
  roomCleanupTimers.delete(code);
};

const scheduleRoomCleanup = (code) => {
  cancelRoomCleanup(code);
  const timer = setTimeout(() => {
    const room = rooms.get(code);
    if (!room || room.users.size > 0) return;
    rooms.delete(code);
    roomCleanupTimers.delete(code);
  }, EMPTY_ROOM_TTL_MS);
  roomCleanupTimers.set(code, timer);
};

const createRoom = (socketId, userId, username) => {
  const code = generateCode();
  const room = {
    code,
    hostId: socketId,
    users: new Map([[socketId, { socketId, userId, username }]]),
    teamAssignments: new Map(),
    createdAt: new Date(),
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

  if (room.users.size === 0) {
    room.hostId = socketId;
  }

  for (const [existingSocketId, existingUser] of room.users.entries()) {
    if (existingUser.userId === userId) {
      room.users.delete(existingSocketId);
      socketToRoom.delete(existingSocketId);
      if (room.hostId === existingSocketId) {
        room.hostId = socketId;
      }
    }
  }

  room.users.set(socketId, { socketId, userId, username });
  socketToRoom.set(socketId, code);
  return { room: serializeRoom(room) };
};

/**
 * Called on socket disconnect. Removes the active socket but keeps the team
 * assignment so the user can refresh and reclaim the same team.
 */
const leaveRoom = (socketId) => {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  room.users.delete(socketId);
  socketToRoom.delete(socketId);

  if (room.users.size === 0) {
    scheduleRoomCleanup(code);
    return null;
  }

  if (room.hostId === socketId) {
    room.hostId = room.users.keys().next().value;
  }

  return serializeRoom(room);
};

/**
 * Called on explicit room:leave. Preserves team assignment by default so
 * users can step out and reclaim the same team when they return.
 */
const leaveRoomExplicit = (socketId, { releaseTeam = false } = {}) => {
  const code = socketToRoom.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  const userEntry = room?.users.get(socketId);
  if (releaseTeam && userEntry) room.teamAssignments.delete(userEntry.userId);

  return leaveRoom(socketId);
};

/**
 * Pick a team in a room.
 * Returns { error } if the team is already taken by someone else.
 */
const pickTeam = (socketId, teamInfo) => {
  const code = socketToRoom.get(socketId);
  if (!code) return { error: 'Not in a room' };

  const room = rooms.get(code);
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

  room.hostId = toSocketId;
  return { room: serializeRoom(room) };
};

const getRoom = (code) => {
  const room = rooms.get(code);
  return room ? serializeRoom(room) : null;
};

const getRoomBySocket = (socketId) => {
  const code = socketToRoom.get(socketId);
  return code ? getRoom(code) : null;
};

const getRawRoom = (socketId) => {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
};

const getRawRoomByCode = (code) => rooms.get(code) ?? null;
const roomExists = (code) => rooms.has(code);

/**
 * Fallback lookup by userId — used when a socket reconnects and
 * socketToRoom hasn't been updated yet (race condition during room:join).
 * Finds a room where this userId has a team assignment.
 */
const getRawRoomByUserId = (userId) => {
  for (const room of rooms.values()) {
    if (room.teamAssignments.has(userId)) return room;
  }
  return null;
};

const getAssignedTeamIds = () => {
  const assignedTeamIds = new Set();
  for (const room of rooms.values()) {
    for (const user of room.users.values()) {
      const assignment = room.teamAssignments.get(user.userId);
      if (assignment?.teamId) assignedTeamIds.add(String(assignment.teamId));
    }
  }
  return [...assignedTeamIds];
};

const isUserHost = (userId) => {
  for (const room of rooms.values()) {
    const hostUser = room.users.get(room.hostId);
    if (hostUser && hostUser.userId === String(userId)) {
      return true;
    }
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

