import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider }  from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { RoomProvider }  from './context/RoomContext';
import { ThemeProvider } from './context/ThemeContext';
import { useSocket }     from './context/SocketContext';
import Navbar        from './components/common/Navbar';
import LoginPage     from './pages/LoginPage';
import RegisterPage  from './pages/RegisterPage';
import RoomPage      from './pages/RoomPage';
import RankingPage   from './pages/RankingPage';
import PrivateRoute  from './components/common/PrivateRoute';
import { playSoldSound, playTickBeep, playTimeUpSound } from './utils/auctionAudio';

/**
 * Runs permanently across all pages.
 * Drives sold sound + tick/time-up sounds from raw socket events
 * so they work even when AuctionBoard is not mounted.
 */
function GlobalAuctionSounds() {
  const { socket } = useSocket();
  // Track timer state needed to drive ticks
  const tickRef      = useRef(null);   // setInterval handle
  const timeLeftRef  = useRef(0);      // current countdown value
  const durationRef  = useRef(10);     // full timer duration (for urgency curve)

  const startTick = (expiresAt, duration) => {
    clearInterval(tickRef.current);
    durationRef.current = duration || 10;

    tickRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      const prev      = timeLeftRef.current;
      timeLeftRef.current = remaining;

      if (remaining === 0) {
        clearInterval(tickRef.current);
        if (prev > 0) playTimeUpSound();
        return;
      }
      if (remaining < prev) {
        playTickBeep(remaining, durationRef.current);
      }
    }, 250);
  };

  const stopTick = () => {
    clearInterval(tickRef.current);
    timeLeftRef.current = 0;
  };

  useEffect(() => {
    if (!socket) return;

    const onSold     = () => playSoldSound();
    const onUnsold   = () => stopTick();
    const onCompleted = () => stopTick();
    const onStatus   = ({ status }) => { if (status !== 'active') stopTick(); };

    // Server emits expiresAt — derive remaining locally (same as useAuction)
    const onTimer = ({ expiresAt }) => {
      if (!expiresAt) { stopTick(); return; }
      startTick(expiresAt, durationRef.current);
    };

    const onNextPlayer = ({ timerEndsAt, timerDuration }) => {
      if (timerEndsAt) startTick(new Date(timerEndsAt).getTime(), timerDuration);
    };

    const onResumed = ({ timerEndsAt, timerDuration }) => {
      if (timerEndsAt) startTick(new Date(timerEndsAt).getTime(), timerDuration);
    };

    const onBidUpdate = ({ timerEndsAt }) => {
      if (timerEndsAt) startTick(new Date(timerEndsAt).getTime(), durationRef.current);
    };

    socket.on('auction:sold',        onSold);
    socket.on('auction:unsold',      onUnsold);
    socket.on('auction:completed',   onCompleted);
    socket.on('auction:status',      onStatus);
    socket.on('auction:timer',       onTimer);
    socket.on('auction:nextPlayer',  onNextPlayer);
    socket.on('auction:resumed',     onResumed);
    socket.on('bid:update',          onBidUpdate);

    return () => {
      socket.off('auction:sold',        onSold);
      socket.off('auction:unsold',      onUnsold);
      socket.off('auction:completed',   onCompleted);
      socket.off('auction:status',      onStatus);
      socket.off('auction:timer',       onTimer);
      socket.off('auction:nextPlayer',  onNextPlayer);
      socket.off('auction:resumed',     onResumed);
      socket.off('bid:update',          onBidUpdate);
      clearInterval(tickRef.current);
    };
  }, [socket]);

  return null;
}

function AppShell() {
  const location = useLocation();
  const isRoomRoute = location.pathname === '/room';

  return (
    <>
      <GlobalAuctionSounds />
      {!isRoomRoute && <Navbar />}
      <div className={isRoomRoute ? 'app-height overflow-hidden' : 'pt-[73px] min-h-screen'}>
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/"         element={<Navigate to="/room" />} />
          <Route path="/room"     element={<PrivateRoute><RoomPage /></PrivateRoute>} />
          <Route path="/ranking"  element={<PrivateRoute><RankingPage /></PrivateRoute>} />
          <Route path="/auction"  element={<Navigate to="/room" />} />
          <Route path="/teams"    element={<Navigate to="/room" />} />
          <Route path="/players"  element={<Navigate to="/room" />} />
          <Route path="*"         element={<Navigate to="/room" />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <RoomProvider>
            <BrowserRouter>
              <AppShell />
            </BrowserRouter>
          </RoomProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
