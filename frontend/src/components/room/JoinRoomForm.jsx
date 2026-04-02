import React, { useState } from 'react';
import { useRoom } from '../../context/RoomContext';
import api from '../../services/api';

export default function JoinRoomForm() {
  const { joinRoom } = useRoom();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Enter a room code'); return; }
    if (trimmed.length !== 6) { setError('Room code must be 6 characters'); return; }

    setError('');
    setLoading(true);
    try {
      // Validate with REST before emitting the socket event
      await api.get(`/rooms/${trimmed}`);
      joinRoom(trimmed);
    } catch (err) {
      setError(err.response?.data?.message || 'Room not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">Join a Room</h2>
        <p className="text-gray-400 text-sm mt-1">Enter the 6-character code shared by the host.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
          maxLength={6}
          placeholder="e.g. AB3X7K"
          className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white text-lg font-mono tracking-widest placeholder-gray-500 focus:outline-none focus:border-ipl-gold text-center uppercase transition"
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ipl-blue text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {loading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {loading ? 'Joining...' : 'Join Room'}
        </button>
      </form>
    </div>
  );
}
