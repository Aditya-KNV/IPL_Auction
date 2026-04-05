import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth }   from './AuthContext';

const RoomContext = createContext(null);

const STORAGE_KEY = 'ipl_room_code';

const initialState = {
  room:            null,
  status:          'idle',
  teamAssignments: {},
  error:           null,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'JOINED':
      localStorage.setItem(STORAGE_KEY, action.room.code);
      return {
        ...state,
        room:            action.room,
        status:          'in-room',
        teamAssignments: action.room.teamAssignments ?? {},
        error:           null,
      };
    case 'USERS_UPDATED':
      return {
        ...state,
        room: state.room ? { ...state.room, users: action.users, hostId: action.hostId } : state.room,
      };
    case 'TEAMS_UPDATED':
      return { ...state, teamAssignments: action.teamAssignments };
    case 'LEFT':
      localStorage.removeItem(STORAGE_KEY);
      return initialState;
    case 'ERROR':
      return { ...state, error: action.message };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
};

export const RoomProvider = ({ children }) => {
  const { socket }  = useSocket();
  const { user }    = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('room:created',       ({ room })            => dispatch({ type: 'JOINED', room }));
    socket.on('room:joined',        ({ room })            => dispatch({ type: 'JOINED', room }));
    socket.on('room:users',         ({ users, hostId })   => dispatch({ type: 'USERS_UPDATED', users, hostId }));
    socket.on('room:teams-updated', ({ teamAssignments }) => dispatch({ type: 'TEAMS_UPDATED', teamAssignments }));
    socket.on('room:kicked',        ()                    => dispatch({ type: 'LEFT' }));
    socket.on('room:error',         ({ message })         => {
      // If room not found on auto-rejoin, clear stale code
      if (message === 'Room not found') localStorage.removeItem(STORAGE_KEY);
      dispatch({ type: 'ERROR', message });
    });

    return () => {
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:users');
      socket.off('room:teams-updated');
      socket.off('room:kicked');
      socket.off('room:error');
    };
  }, [socket]);

  // ── Auto-rejoin on connect/reconnect ─────────────────────────────────────
  useEffect(() => {
    if (!socket || !user) return;

    const tryRejoin = () => {
      const savedCode = localStorage.getItem(STORAGE_KEY);
      if (savedCode && state.status === 'idle') {
        socket.emit('room:join', { code: savedCode });
      }
    };

    socket.on('connect', tryRejoin);
    // Also try immediately in case socket is already connected
    if (socket.connected) tryRejoin();

    return () => socket.off('connect', tryRejoin);
  }, [socket, user, state.status]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const createRoom = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
    socket?.emit('room:create');
  }, [socket]);

  const joinRoom = useCallback((code) => {
    dispatch({ type: 'CLEAR_ERROR' });
    socket?.emit('room:join', { code });
  }, [socket]);

  const leaveRoom = useCallback(() => {
    socket?.emit('room:leave');
    dispatch({ type: 'LEFT' });
  }, [socket]);

  const kickUser = useCallback((targetSocketId) => {
    socket?.emit('room:kick', { targetSocketId });
  }, [socket]);

  const pickTeam = useCallback((teamInfo) => {
    socket?.emit('room:pick-team', teamInfo);
  }, [socket]);

  const transferHost = useCallback((targetSocketId) => {
    socket?.emit('room:transfer-host', { targetSocketId });
  }, [socket]);

  return (
    <RoomContext.Provider value={{ ...state, createRoom, joinRoom, leaveRoom, kickUser, pickTeam, transferHost }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
