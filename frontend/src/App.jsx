import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider }  from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { RoomProvider }  from './context/RoomContext';
import Navbar        from './components/common/Navbar';
import LoginPage     from './pages/LoginPage';
import RegisterPage  from './pages/RegisterPage';
import RoomPage      from './pages/RoomPage';
import RankingPage   from './pages/RankingPage';
import PrivateRoute  from './components/common/PrivateRoute';

function AppShell() {
  const location = useLocation();
  const isRoomRoute = location.pathname === '/room';

  return (
    <>
      <Navbar />
      <div className={isRoomRoute ? 'pt-[73px] h-screen overflow-hidden' : 'pt-[73px] min-h-screen'}>
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
    <AuthProvider>
      <SocketProvider>
        <RoomProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </RoomProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
