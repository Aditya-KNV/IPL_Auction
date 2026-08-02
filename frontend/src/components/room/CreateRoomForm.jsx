import React from 'react';
import { useRoom } from '../../context/RoomContext';

export default function CreateRoomForm() {
  const { createRoom } = useRoom();

  return (
    <div className="border border-white/[0.08] bg-surface rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[2px] text-white/25 mb-1">Host</p>
        <h2 className="text-xl font-black text-white">Create a Room</h2>
        <p className="text-white/40 text-sm mt-1">Generate a unique code and invite others to join.</p>
      </div>

      <button
        onClick={createRoom}
        className="w-full bg-neon text-black font-bold py-3 rounded-xl transition
                   flex items-center justify-center gap-2
                   hover:brightness-110 hover:shadow-[0_0_24px_rgba(0,255,102,.25)]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create Room
      </button>
    </div>
  );
}
