import React, { useState } from 'react';
import { useRoom } from '../../context/RoomContext';
import api from '../../services/api';

export default function JoinRoomForm() {
  const { joinRoom } = useRoom();
  const [code, setCode]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Enter a room code'); return; }
    if (trimmed.length !== 6) { setError('Room code must be 6 characters'); return; }

    setError('');
    setLoading(true);
    try {
      await api.get(`/rooms/${trimmed}`);
      joinRoom(trimmed);
    } catch (err) {
      setError(err.response?.data?.message || 'Room not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-white/[0.08] bg-surface rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[2px] text-white/25 mb-1">Join</p>
        <h2 className="text-xl font-black text-white">Enter a Room</h2>
        <p className="text-white/40 text-sm mt-1">Enter the 6-character code shared by the host.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
          maxLength={6}
          placeholder="e.g. AB3X7K"
          className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-4 py-3 text-white text-lg
                     font-mono tracking-widest placeholder-white/20 text-center uppercase
                     focus:outline-none focus:border-neon/50 transition"
        />
        {error && <p className="text-bid-red text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full border border-white/[0.1] bg-surface-2 text-white font-bold py-3 rounded-xl transition
                     flex items-center justify-center gap-2
                     hover:border-neon/40 hover:text-neon
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {loading ? 'Joining…' : 'Join Room'}
        </button>
      </form>
    </div>
  );
}
