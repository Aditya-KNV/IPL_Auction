const Player = require('../models/Player');

const MAX_OVERSEAS_SQUAD   = 8;  // max overseas in the whole squad
const MAX_OVERSEAS_PLAYING = 4;  // max overseas in the playing 12
const MAX_OVERSEAS_PLAYERS = MAX_OVERSEAS_SQUAD; // legacy alias

const isOverseasPlayer = (player) =>
  !!player && String(player.nationality || '').trim().toLowerCase() !== 'indian';

const getOverseasCount = async (teamId) =>
  Player.countDocuments({ team: teamId, status: 'sold', nationality: { $ne: 'Indian' } });

const getTotalSquadCount = async (teamId) =>
  Player.countDocuments({ team: teamId, status: 'sold' });

const canTeamBuyPlayer = async (teamId, player) => {
  if (!isOverseasPlayer(player)) {
    return { allowed: true, overseasCount: 0 };
  }

  const [overseasCount, totalCount] = await Promise.all([
    getOverseasCount(teamId),
    getTotalSquadCount(teamId),
  ]);

  // Hard squad cap
  if (overseasCount >= MAX_OVERSEAS_SQUAD) {
    return { allowed: false, reason: 'squad', overseasCount, totalCount };
  }

  // Playing-12 cap: once a team fills their first 12 spots they are free to
  // add bench overseas up to the squad cap.  While still building the playing
  // 12 (fewer than 12 players owned) they may hold at most 4 overseas so the
  // playing XI can always include at most 4 foreigners.
  if (totalCount < 12 && overseasCount >= MAX_OVERSEAS_PLAYING) {
    return { allowed: false, reason: 'playing12', overseasCount, totalCount };
  }

  return { allowed: true, overseasCount, totalCount };
};

module.exports = {
  MAX_OVERSEAS_PLAYERS,
  MAX_OVERSEAS_SQUAD,
  MAX_OVERSEAS_PLAYING,
  isOverseasPlayer,
  getOverseasCount,
  getTotalSquadCount,
  canTeamBuyPlayer,
};
