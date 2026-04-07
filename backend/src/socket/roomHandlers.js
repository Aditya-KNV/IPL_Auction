const { createRoom, joinRoom, leaveRoom, leaveRoomExplicit, pickTeam, transferHost, getRoomBySocket } = require('./roomStore');
const { resetAuctionState } = require('../services/auctionReset');

/**
 * Attach all room:* handlers to a connected socket.
 * socket.user is set by the auth middleware before this runs.
 */
const registerRoomHandlers = (io, socket) => {
  const { userId, username } = socket.user;

  // ── room:create ────────────────────────────────────────────────────────────
  // Client sends: (no payload needed — user info comes from socket.user)
  // Server emits to caller: room:created  { room }
  socket.on('room:create', async () => {
    // If already in a room, leave it first
    const existing = getRoomBySocket(socket.id);
    if (existing) _leave(io, socket);

    // Create the room first so we have the code for the scoped session reset
    const room = createRoom(socket.id, userId, username);
    socket.join(room.code);

    try {
      await resetAuctionState(io, room.code);
    } catch (err) {
      console.error('[room:create] auction reset error:', err.message);
      return socket.emit('room:error', { message: 'Could not prepare a fresh auction room' });
    }

    socket.emit('room:created', { room });

    // Broadcast fresh user list to the room (just the creator for now)
    io.to(room.code).emit('room:users', { users: room.users, hostId: room.hostId });

    console.log(`[room] ${username} created room ${room.code}`);
  });

  // ── room:join ──────────────────────────────────────────────────────────────
  // Client sends: { code }
  // Server emits to caller:         room:joined  { room }
  // Server emits to all in room:    room:users   { users, hostId }
  // Server emits to existing members: room:userJoined { user }
  socket.on('room:join', ({ code }) => {
    if (!code || typeof code !== 'string') {
      return socket.emit('room:error', { message: 'Invalid room code' });
    }

    const existing = getRoomBySocket(socket.id);
    if (existing) _leave(io, socket);

    const result = joinRoom(code.toUpperCase(), socket.id, userId, username);
    if (result.error) {
      return socket.emit('room:error', { message: result.error });
    }

    socket.join(result.room.code);
    socket.emit('room:joined', { room: result.room });

    // Tell everyone else a new user arrived
    socket.to(result.room.code).emit('room:userJoined', {
      user: { socketId: socket.id, userId, username },
    });

    // Broadcast fresh user list to all (including the joiner)
    io.to(result.room.code).emit('room:users', {
      users: result.room.users,
      hostId: result.room.hostId,
    });

    console.log(`[room] ${username} joined room ${result.room.code}`);
  });

  // ── room:leave ─────────────────────────────────────────────────────────────
  // Explicit leave — keeps team assignment so the user can rejoin later
  socket.on('room:leave', () => _leaveExplicit(io, socket));

  // ── room:pick-team ─────────────────────────────────────────────────────────
  // Client sends: { teamId, name, shortName, color }
  // Server emits to all in room: room:teams-updated { teamAssignments }
  socket.on('room:pick-team', (teamInfo) => {
    if (!teamInfo?.teamId) return socket.emit('room:error', { message: 'Invalid team' });

    const result = pickTeam(socket.id, teamInfo);
    if (result.error) return socket.emit('room:error', { message: result.error });

    io.to(result.room.code).emit('room:teams-updated', {
      teamAssignments: result.room.teamAssignments,
    });
  });

  // ── room:kick ──────────────────────────────────────────────────────────────
  // Only the host can kick. Client sends: { targetSocketId }
  socket.on('room:kick', ({ targetSocketId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) {
      return socket.emit('room:error', { message: 'Only the host can kick users' });
    }
    if (targetSocketId === socket.id) {
      return socket.emit('room:error', { message: 'You cannot kick yourself' });
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('room:kicked', { message: 'You were removed from the room by the host' });
      _leaveExplicit(io, targetSocket, { releaseTeam: true });
    }
  });

  // ── room:transfer-host ─────────────────────────────────────────────────────
  // Host transfers host role to another user. Client sends: { targetSocketId }
  socket.on('room:transfer-host', ({ targetSocketId }) => {
    const result = transferHost(socket.id, targetSocketId);
    if (result.error) return socket.emit('room:error', { message: result.error });

    io.to(result.room.code).emit('room:users', {
      users: result.room.users,
      hostId: result.room.hostId,
    });

    console.log(`[room] ${username} transferred host to ${targetSocketId} in ${result.room.code}`);
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnecting', () => _leave(io, socket));
};

// ── Shared leave logic ────────────────────────────────────────────────────────

/** Callback fired when the 3-min host grace timer expires. */
const _onHostTransfer = (io) => (code, room) => {
  io.to(code).emit('room:users', { users: room.users, hostId: room.hostId });
  io.to(code).emit('room:host-transferred', {
    newHostId: room.hostId,
    reason: 'host-offline',
  });
};

const _leave = (io, socket) => {
  const updatedRoom = leaveRoom(socket.id, { onHostTransfer: _onHostTransfer(io) });
  _broadcast(io, socket, updatedRoom);
};

const _leaveExplicit = (io, socket, options) => {
  const updatedRoom = leaveRoomExplicit(socket.id, { ...options, onHostTransfer: _onHostTransfer(io) });
  _broadcast(io, socket, updatedRoom);
};

const _broadcast = (io, socket, updatedRoom) => {
  const { username } = socket.user;
  if (updatedRoom) {
    socket.leave(updatedRoom.code);
    io.to(updatedRoom.code).emit('room:userLeft', {
      socketId: socket.id, username, newHostId: updatedRoom.hostId,
    });
    io.to(updatedRoom.code).emit('room:users', {
      users: updatedRoom.users, hostId: updatedRoom.hostId,
    });
    io.to(updatedRoom.code).emit('room:teams-updated', {
      teamAssignments: updatedRoom.teamAssignments,
    });
    console.log(`[room] ${username} left room ${updatedRoom.code}`);
  }
};

module.exports = { registerRoomHandlers };
