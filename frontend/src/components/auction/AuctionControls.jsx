import { useState, useRef, useEffect } from 'react';
import api from '../../services/api';

const Btn = ({ onClick, disabled, color, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
  >
    {children}
  </button>
);

const AccelConfigPopover = ({ onConfirm, onClose }) => {
  const [maxPicks, setMaxPicks] = useState(7);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const adjust = (delta) =>
    setMaxPicks((v) => Math.max(0, v + delta));

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 w-56"
    >
      <p className="text-white text-sm font-semibold mb-0.5">Accelerated Auction</p>
      <p className="text-gray-500 text-[11px] mb-3">Max picks per team</p>

      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={() => adjust(-1)}
          className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition font-bold text-lg leading-none flex items-center justify-center"
        >
          −
        </button>

        <div className="flex-1 text-center">
          <span className="text-2xl font-black text-white tabular-nums">{maxPicks}</span>
          {maxPicks === 0 && (
            <p className="text-[10px] text-gray-500 mt-0.5">no picks</p>
          )}
        </div>

        <button
          onClick={() => adjust(1)}
          className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition font-bold text-lg leading-none flex items-center justify-center"
        >
          +
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-gray-400 border border-gray-700 hover:border-gray-500 transition"
        >
          Cancel
        </button>
        <button
          onClick={() => { onConfirm(maxPicks); onClose(); }}
          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-yellow-400 text-black hover:bg-yellow-300 transition"
        >
          ⚡ Start
        </button>
      </div>
    </div>
  );
};

export default function AuctionControls({ session, onRefetch, onAccelerated }) {
  const [loading, setLoading] = useState(false);
  const [showAccelConfig, setShowAccelConfig] = useState(false);

  const action = async (endpoint) => {
    setLoading(true);
    try {
      await api.post(`/auction/${endpoint}`);
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
    <div className="relative flex flex-wrap items-center justify-end gap-2">
      {notStarted && (
        <Btn
          onClick={() => action('start')}
          disabled={loading}
          color="border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20"
        >
          Start
        </Btn>
      )}

      {status === 'active' && (
        <Btn
          onClick={() => action('pause')}
          disabled={loading}
          color="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
        >
          Pause
        </Btn>
      )}

      {status === 'paused' && (
        <Btn
          onClick={() => action('resume')}
          disabled={loading}
          color="border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20"
        >
          Resume
        </Btn>
      )}

      {(status === 'active' || status === 'paused') && onAccelerated && (
        <div className="relative">
          <Btn
            onClick={() => setShowAccelConfig((v) => !v)}
            disabled={loading}
            color="border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
          >
            ⚡ Accelerated
          </Btn>
          {showAccelConfig && (
            <AccelConfigPopover
              onConfirm={onAccelerated}
              onClose={() => setShowAccelConfig(false)}
            />
          )}
        </div>
      )}

      {(status === 'active' || status === 'paused') && (
        <Btn
          onClick={() => {
            if (window.confirm('End the auction? This cannot be undone.')) action('end');
          }}
          disabled={loading}
          color="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
        >
          End
        </Btn>
      )}
    </div>
  );
}
