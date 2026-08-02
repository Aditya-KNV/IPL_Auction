import React from 'react';
import { useNavigate } from 'react-router-dom';
import AuctionBoard from '../components/auction/AuctionBoard';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';

const GateScreen = ({ icon, title, subtitle, sub2, btnLabel, onBtnClick }) => (
  <div className="min-h-screen flex items-center justify-center bg-obsidian relative">
    <div className="ambient-glows absolute inset-0 pointer-events-none" />
    <div className="relative border border-white/[0.08] rounded-2xl p-10 text-center max-w-sm bg-surface shadow-2xl">
      <div className="w-14 h-14 rounded-full border border-white/[0.08] bg-surface-2 flex items-center justify-center mx-auto mb-5 text-2xl">
        {icon}
      </div>
      <h2 className="text-white font-black text-xl mb-2">{title}</h2>
      {subtitle && <p className="text-white/40 text-sm mb-2">{subtitle}</p>}
      {sub2 && <p className="text-white/25 text-xs mb-6">{sub2}</p>}
      {!sub2 && <div className="mb-6" />}
      <button onClick={onBtnClick}
        className="bg-neon text-black font-bold px-6 py-2.5 rounded-xl hover:brightness-110 transition">
        {btnLabel}
      </button>
    </div>
  </div>
);

export default function AuctionPage() {
  const { status, teamAssignments, room } = useRoom();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (status !== 'in-room') {
    return (
      <GateScreen
        icon="🔒"
        title="No Active Room"
        subtitle="You need to join or create a room before entering the auction."
        btnLabel="Go to Rooms"
        onBtnClick={() => navigate('/room')}
      />
    );
  }

  const myAssignment = user ? teamAssignments?.[user.id] : null;
  if (!myAssignment) {
    return (
      <GateScreen
        icon="🏏"
        title="Pick a Team First"
        subtitle={<>You are in room <span className="text-neon font-mono font-bold">{room?.code}</span> but haven't selected a team yet.</>}
        sub2="Go back to the lobby and pick your team before the auction starts."
        btnLabel="Back to Lobby"
        onBtnClick={() => navigate('/room')}
      />
    );
  }

  return <AuctionBoard />;
}
