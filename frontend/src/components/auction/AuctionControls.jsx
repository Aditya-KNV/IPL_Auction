import { useState } from 'react';
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

export default function AuctionControls({ session, onRefetch }) {
  const [loading, setLoading] = useState(false);

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
    <div className="flex flex-wrap items-center justify-end gap-2">
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
