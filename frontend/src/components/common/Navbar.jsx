import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth }    from '../../context/AuthContext';
import { useSocket }  from '../../context/SocketContext';
import ThemeToggle    from './ThemeToggle';

const NAV_LINKS = [
  { to: '/',        label: 'Overview' },
  { to: '/room',    label: 'Rooms'    },
  { to: '/ranking', label: 'Rankings' },
  { to: '/players', label: 'Players'  },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { connected }    = useSocket();
  const navigate         = useNavigate();
  const { pathname }     = useLocation();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-[57px] flex items-center px-5 justify-between"
         style={{
           background: 'rgb(var(--obsidian) / 0.92)',
           backdropFilter: 'blur(12px)',
           WebkitBackdropFilter: 'blur(12px)',
           borderBottom: '1px solid rgb(var(--fg) / 0.055)',
           boxShadow: '0 1px 0 rgb(var(--fg) / 0.025)',
         }}>

      {/* Top accent line */}
      <div className="absolute top-0 inset-x-0 h-px pointer-events-none"
           style={{ background: 'linear-gradient(90deg, transparent 0%, rgb(var(--neon) / 0.22) 40%, rgb(var(--neon) / 0.22) 60%, transparent 100%)' }} />

      {/* Brand */}
      <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-neon flex items-center justify-center flex-shrink-0"
             style={{ boxShadow: '0 0 12px rgb(var(--neon) / 0.28)' }}>
          <svg className="w-4 h-4 text-black" viewBox="0 0 16 16" fill="none">
            <path d="M10 2L2 10l1.5 1.5 2-2 3 3 1.5-1.5-3-3 2-2L10 2z" fill="currentColor"/>
            <circle cx="13" cy="13" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold text-[15px] text-white leading-none">IPL</span>
          <span className="text-[15px] text-white/30 font-light leading-none ml-1">Auction</span>
        </div>
      </Link>

      {user && (
        <>
          {/* Page nav */}
          <div className="hidden md:flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
            {NAV_LINKS.map(({ to, label }) => {
              const active = pathname === to || (to !== '/' && pathname.startsWith(to));
              return (
                <Link key={to} to={to}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150
                    ${active
                      ? 'text-white bg-white/[0.07]'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                    }`}>
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Socket indicator */}
            <div className="flex items-center gap-1.5" title={connected ? 'Connected' : 'Disconnected'}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-neon animate-live-blink' : 'bg-bid-red'}`} />
              <span className={`text-[11px] font-medium hidden sm:block ${connected ? 'text-white/35' : 'text-bid-red/60'}`}>
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>

            <div className="w-px h-3.5 bg-white/[0.08]" />

            <ThemeToggle />

            <div className="w-px h-3.5 bg-white/[0.08]" />

            {/* User avatar + name */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.07] border border-white/[0.09]
                              flex items-center justify-center text-[10px] font-bold text-white/55">
                {user.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-[13px] text-white/45 hidden sm:block">{user.username}</span>
            </div>

            <button onClick={handleLogout}
              className="text-[12px] font-medium text-white/35 hover:text-white/70
                         border border-white/[0.07] hover:border-white/[0.12]
                         px-3 py-1.5 rounded-lg transition-all duration-150
                         hover:bg-white/[0.03]">
              Sign out
            </button>
          </div>
        </>
      )}

      {!user && <ThemeToggle />}
    </nav>
  );
}
