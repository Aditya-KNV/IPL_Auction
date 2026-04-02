import React from 'react';
import { useNavigate } from 'react-router-dom';
import AuctionBoard from '../components/auction/AuctionBoard';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';

export default function AuctionPage() {
  const { status, teamAssignments, room } = useRoom();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Must be in a room
  if (status !== 'in-room') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ipl-dark">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center max-w-sm">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-white font-bold text-xl mb-2">No Active Room</h2>
          <p className="text-gray-400 text-sm mb-6">You need to join or create a room before entering the auction.</p>
          <button onClick={() => navigate('/room')}
            className="bg-ipl-gold text-black font-bold px-6 py-2.5 rounded-xl hover:brightness-110 transition">
            Go to Rooms
          </button>
        </div>
      </div>
    );
  }

  // Must have picked a team
  const myAssignment = user ? teamAssignments?.[user.id] : null;
  if (!myAssignment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ipl-dark">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center max-w-sm">
          <p className="text-4xl mb-4">🏏</p>
          <h2 className="text-white font-bold text-xl mb-2">Pick a Team First</h2>
          <p className="text-gray-400 text-sm mb-2">
            You are in room <span className="text-ipl-gold font-mono font-bold">{room?.code}</span> but haven't selected a team yet.
          </p>
          <p className="text-gray-500 text-xs mb-6">Go back to the lobby and pick your team before the auction starts.</p>
          <button onClick={() => navigate('/room')}
            className="bg-ipl-gold text-black font-bold px-6 py-2.5 rounded-xl hover:brightness-110 transition">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return <AuctionBoard />;
}
