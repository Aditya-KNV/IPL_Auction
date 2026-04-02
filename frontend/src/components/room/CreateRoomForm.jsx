import React from 'react';
import { useRoom } from '../../context/RoomContext';

export default function CreateRoomForm() {
  const { createRoom } = useRoom();

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">Host a Room</h2>
        <p className="text-gray-400 text-sm mt-1">
          Generate a unique code and invite others to join.
        </p>
      </div>

      <button
        onClick={createRoom}
        className="w-full bg-ipl-gold text-black font-bold py-3 rounded-xl hover:brightness-110 transition flex items-center justify-center gap-2"
      >
        {/* Plus icon */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create Room
      </button>
    </div>
  );
}
