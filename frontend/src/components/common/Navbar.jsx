import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth }   from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const NAV_LINKS = [
  { to: '/room', label: 'Rooms' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { connected }    = useSocket();
  const navigate         = useNavigate();
  const { pathname }     = useLocation();
  const showBottomBorder = pathname !== '/room';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className={`fixed top-0 inset-x-0 z-50 bg-gray-950 px-6 py-4 ${showBottomBorder ? 'border-b border-gray-800' : ''}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/room" className="text-ipl-gold font-bold text-2xl tracking-wide">
          IPL Auction
        </Link>

        {user && (
          <>
            <div className="flex items-center gap-1">
              {NAV_LINKS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    pathname === to
                      ? 'text-white bg-gray-800'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <span
                className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                title={connected ? 'Connected' : 'Disconnected'}
              />
              <span className="text-gray-400 text-sm">{user.username}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-400 hover:text-red-300 transition"
              >
                Logout
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
