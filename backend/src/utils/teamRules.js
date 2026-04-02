const Player = require('../models/Player');

const MAX_OVERSEAS_PLAYERS = 8;

const isOverseasPlayer = (player) =>
  !!player && String(player.nationality || '').trim().toLowerCase() !== 'indian';

const getOverseasCount = async (teamId) =>
  Player.countDocuments({
    team: teamId,
    status: 'sold',
    nationality: { $ne: 'Indian' },
  });

const canTeamBuyPlayer = async (teamId, player) => {
  if (!isOverseasPlayer(player)) {
    return { allowed: true, overseasCount: 0 };
  }

  const overseasCount = await getOverseasCount(teamId);
  return {
    allowed: overseasCount < MAX_OVERSEAS_PLAYERS,
    overseasCount,
  };
};

module.exports = {
  MAX_OVERSEAS_PLAYERS,
  isOverseasPlayer,
  getOverseasCount,
  canTeamBuyPlayer,
};
