import { useState } from 'react';
import api from '../../services/api';

const Btn = ({ onClick, disabled, color, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full font-bold py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
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
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-700 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Host Controls
      </p>

      {notStarted && (
        <Btn onClick={() => action('start')} disabled={loading}
          color="bg-green-600 hover:bg-green-500 text-white">
          Start Auction
        </Btn>
      )}

      {status === 'active' && (
        <Btn onClick={() => action('pause')} disabled={loading}
          color="bg-yellow-600 hover:bg-yellow-500 text-white">
          Pause Auction
        </Btn>
      )}

      {status === 'paused' && (
        <Btn onClick={() => action('resume')} disabled={loading}
          color="bg-green-600 hover:bg-green-500 text-white">
          Resume Auction
        </Btn>
      )}

      {(status === 'active' || status === 'paused') && (
        <Btn
          onClick={() => {
            if (window.confirm('End the auction? This cannot be undone.')) action('end');
          }}
          disabled={loading}
          color="bg-red-700 hover:bg-red-600 text-white"
        >
          End Auction
        </Btn>
      )}

      {status === 'completed' && (
        <p className="text-center text-green-400 text-sm font-semibold py-2">
          Auction Completed
        </p>
      )}
    </div>
  );
}
