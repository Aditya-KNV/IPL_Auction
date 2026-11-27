export const hasBattingStats = (role) => role === 'Batsman' || role === 'Wicket-Keeper' || role === 'All-Rounder';

export const hasBowlingStats = (role) => role === 'Bowler' || role === 'All-Rounder';

export const isOverseasPlayer = (player) => {
  const nationality = String(player?.nationality || '').trim().toLowerCase();
  return nationality.length > 0 && nationality !== 'indian';
};

export const getDisplayStatus = (player) => player?.displayStatus || player?.status || 'available';

export const STATUS_COLOR = {
  sold: 'text-green-400',
  unsold: 'text-red-400',
  'in-auction': 'text-yellow-400',
  available: 'text-white/40',
};
