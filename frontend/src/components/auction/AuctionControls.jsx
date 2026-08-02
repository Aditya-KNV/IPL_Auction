import { useState, useRef, useEffect } from 'react';
import api         from '../../services/api';
import { useRoom } from '../../context/RoomContext';

const Btn = ({ onClick, disabled, variant, children }) => {
  const styles = {
    green:  'border-neon/30 bg-neon/[0.08] text-neon hover:bg-neon/[0.15]',
    amber:  'border-orange-400/30 bg-orange-400/[0.08] text-orange-300 hover:bg-orange-400/[0.15]',
    yellow: 'border-gold-bright/30 bg-gold-bright/[0.08] text-gold-bright hover:bg-gold-bright/[0.15]',
    red:    'border-bid-red/30 bg-bid-red/[0.08] text-bid-red hover:bg-bid-red/[0.15]',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-[10px] font-black
                  uppercase tracking-[0.18em] transition
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${styles[variant] ?? styles.green}`}>
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

export default function AuctionControls({ session, onRefetch, onAccelerated }) {
  const [loading,         setLoading]         = useState(false);
  const [showAccelConfig, setShowAccelConfig] = useState(false);
  const { room } = useRoom();

  const action = async (endpoint) => {
    setLoading(true);
    try {
      await api.post(`/auction/${endpoint}`, { roomCode: room?.code });
      onRefetch();
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  const { status } = session || {};
  const notStarted = !session || status === 'waiting';

  return (
    <div className="relative flex items-center gap-2 flex-wrap">
      {notStarted && (
        <Btn onClick={() => action('start')} disabled={loading} variant="green">▶ Start</Btn>
      )}
      {status === 'active' && (
        <Btn onClick={() => action('pause')} disabled={loading} variant="amber">⏸ Pause</Btn>
      )}
      {status === 'paused' && (
        <Btn onClick={() => action('resume')} disabled={loading} variant="green">▶ Resume</Btn>
      )}
      {(status === 'active' || status === 'paused') && onAccelerated && (
        <div className="relative">
          <Btn onClick={() => setShowAccelConfig(v => !v)} disabled={loading} variant="yellow">⚡ Accel</Btn>
          {showAccelConfig && (
            <AccelConfigPopover onConfirm={onAccelerated} onClose={() => setShowAccelConfig(false)} />
          )}
        </div>
      )}
      {(status === 'active' || status === 'paused') && (
        <Btn
          onClick={() => { if (window.confirm('End the auction? This cannot be undone.')) action('end'); }}
          disabled={loading} variant="red">
          ■ End
        </Btn>
      )}
    </div>
  );
}
