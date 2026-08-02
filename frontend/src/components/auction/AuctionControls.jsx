import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api            from '../../services/api';
import { useRoom }    from '../../context/RoomContext';
import ConfirmDialog  from '../common/ConfirmDialog';

const ICONS = {
  play: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 001.5.87l11-6.5a1 1 0 000-1.74l-11-6.5A1 1 0 008 5.5z" />
    </svg>
  ),
  pause: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5.5A1.5 1.5 0 018.5 4h1A1.5 1.5 0 0111 5.5v13A1.5 1.5 0 019.5 20h-1A1.5 1.5 0 017 18.5v-13zm8 0A1.5 1.5 0 0116.5 4h1a1.5 1.5 0 011.5 1.5v13a1.5 1.5 0 01-1.5 1.5h-1a1.5 1.5 0 01-1.5-1.5v-13z" />
    </svg>
  ),
  zap: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 2.5L4.8 13.6a.75.75 0 00.59 1.21H11l-1.5 6.7a.5.5 0 00.87.44l9-11.4a.75.75 0 00-.59-1.21H13l1.5-6.4a.5.5 0 00-1-.4z" />
    </svg>
  ),
  stop: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
};

// Primary = the one "go" action (Start/Resume) — solid fill so it reads as the
// default next step. Everything else is a secondary outline, tinted by intent.
const Btn = ({ onClick, disabled, variant, icon, children }) => {
  const styles = {
    primary: 'border-transparent bg-neon text-black hover:brightness-110 shadow-[0_2px_12px_rgba(0,255,102,0.28)]',
    amber:   'border-orange-400/30 bg-orange-400/[0.1] text-orange-300 hover:bg-orange-400/[0.18] hover:border-orange-400/45',
    yellow:  'border-gold-bright/30 bg-gold-bright/[0.1] text-gold-bright hover:bg-gold-bright/[0.18] hover:border-gold-bright/45',
    danger:  'border-bid-red/30 bg-bid-red/[0.1] text-bid-red hover:bg-bid-red/[0.18] hover:border-bid-red/45',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl border
                  px-4 py-2 text-xs font-bold tracking-wide
                  transition-all duration-150 active:scale-[0.96]
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
                  ${styles[variant] ?? styles.amber}`}>
      {icon}
      {children}
    </button>
  );
};

const AccelConfigPopover = ({ onConfirm, onClose }) => {
  const [maxPicks, setMaxPicks] = useState(7);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref}
      className="absolute right-0 top-full mt-2 z-50
                 bg-surface-2 border border-white/[0.1] rounded-xl shadow-2xl p-4 w-52">
      <p className="text-white text-sm font-bold mb-0.5">Accelerated Mode</p>
      <p className="text-white/40 text-[11px] mb-4">Max picks per team</p>

      <div className="flex items-center justify-between gap-2 mb-4">
        <button onClick={() => setMaxPicks(v => Math.max(0, v - 1))}
          className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08]
                     text-white/70 hover:text-white hover:bg-white/[0.1]
                     transition font-bold text-lg flex items-center justify-center">−</button>
        <span className="font-bebas text-3xl text-white tabular-nums">{maxPicks}</span>
        <button onClick={() => setMaxPicks(v => v + 1)}
          className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08]
                     text-white/70 hover:text-white hover:bg-white/[0.1]
                     transition font-bold text-lg flex items-center justify-center">+</button>
      </div>

      <div className="flex gap-2">
        <button onClick={onClose}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold
                     text-white/40 border border-white/[0.08] hover:border-white/20 transition">
          Cancel
        </button>
        <button onClick={() => { onConfirm(maxPicks); onClose(); }}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-black
                     bg-gold-bright text-black hover:brightness-110 transition">
          ⚡ Start
        </button>
      </div>
    </div>
  );
};

const ErrorToast = ({ message, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [onDone]);
  // Portalled to <body> — see the comment in ConfirmDialog.jsx: a `backdrop-blur`
  // ancestor (the status strip) would otherwise confine this `fixed` element to its box.
  return createPortal(
    <div className="fixed top-[64px] right-4 z-[70] flex items-center gap-2
                    bg-bid-red/10 border border-bid-red/30 text-bid-red text-sm
                    px-4 py-3 rounded-xl shadow-2xl animate-fade-in max-w-xs">
      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <span className="flex-1">{message}</span>
      <button onClick={onDone} className="text-bid-red/60 hover:text-bid-red flex-shrink-0">✕</button>
    </div>,
    document.body
  );
};

export default function AuctionControls({ session, onRefetch, onAccelerated }) {
  const [loading,         setLoading]         = useState(false);
  const [showAccelConfig, setShowAccelConfig] = useState(false);
  const [showEndConfirm,  setShowEndConfirm]  = useState(false);
  const [error,           setError]           = useState(null);
  const { room } = useRoom();

  const action = async (endpoint) => {
    setLoading(true);
    try {
      await api.post(`/auction/${endpoint}`, { roomCode: room?.code });
      onRefetch();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const { status } = session || {};
  const notStarted = !session || status === 'waiting';

  return (
    <div className="relative flex items-center gap-2 flex-wrap">
      {notStarted && (
        <Btn onClick={() => action('start')} disabled={loading} variant="primary" icon={ICONS.play}>Start</Btn>
      )}
      {status === 'active' && (
        <Btn onClick={() => action('pause')} disabled={loading} variant="amber" icon={ICONS.pause}>Pause</Btn>
      )}
      {status === 'paused' && (
        <Btn onClick={() => action('resume')} disabled={loading} variant="primary" icon={ICONS.play}>Resume</Btn>
      )}
      {(status === 'active' || status === 'paused') && onAccelerated && (
        <div className="relative">
          <Btn onClick={() => setShowAccelConfig(v => !v)} disabled={loading} variant="yellow" icon={ICONS.zap}>Accel</Btn>
          {showAccelConfig && (
            <AccelConfigPopover onConfirm={onAccelerated} onClose={() => setShowAccelConfig(false)} />
          )}
        </div>
      )}
      {(status === 'active' || status === 'paused') && (
        <Btn onClick={() => setShowEndConfirm(true)} disabled={loading} variant="danger" icon={ICONS.stop}>
          End
        </Btn>
      )}

      <ConfirmDialog
        open={showEndConfirm}
        title="End the auction?"
        message="This closes the session for everyone in the room and cannot be undone."
        confirmLabel="End Auction"
        danger
        onConfirm={() => { setShowEndConfirm(false); action('end'); }}
        onCancel={() => setShowEndConfirm(false)}
      />

      {error && <ErrorToast message={error} onDone={() => setError(null)} />}
    </div>
  );
}
