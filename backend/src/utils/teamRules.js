const Player = require('../models/Player');
const Team   = require('../models/Team');

const MAX_OVERSEAS_PLAYING = 4;  // max overseas allowed in the playing 12

const isOverseasPlayer = (player) =>
  !!player && String(player.nationality || '').trim().toLowerCase() !== 'indian';

const getOverseasCount = async (teamId) =>
  Player.countDocuments({ team: teamId, status: 'sold', nationality: { $ne: 'Indian' } });

const getTotalSquadCount = async (teamId) =>
  Player.countDocuments({ team: teamId, status: 'sold' });

/**
 * Dynamic overseas squad cap:
 *  - maxPlayers >= 25  → 8 overseas allowed in squad
 *  - maxPlayers <= 18  → 6 overseas allowed in squad
 *  - anything in between → 8 (default to IPL standard)
 */
const getOverseasSquadCap = (maxPlayers) => {
  if (maxPlayers <= 18) return 6;
  return 8;
};

// teamDoc: optional pre-fetched team object (avoids a redundant DB round-trip)
const canTeamBuyPlayer = async (teamId, player, teamDoc = null) => {
  if (!isOverseasPlayer(player)) {
    return { allowed: true };
  }

  const maxPlayers = teamDoc?.maxPlayers ?? (await Team.findById(teamId).select('maxPlayers').lean())?.maxPlayers ?? 25;
  const maxOverseasSquad = getOverseasSquadCap(maxPlayers);

  // totalCount is not needed for the eligibility check — skip that query
  const overseasCount = await getOverseasCount(teamId);

  if (overseasCount >= maxOverseasSquad) {
    return { allowed: false, reason: 'squad', overseasCount, cap: maxOverseasSquad };
  }

  return { allowed: true, overseasCount };
};

module.exports = {
  MAX_OVERSEAS_PLAYERS: 8,  // legacy alias kept for safety
  MAX_OVERSEAS_SQUAD: 8,    // legacy alias kept for safety
  MAX_OVERSEAS_PLAYING,
  getOverseasSquadCap,
  isOverseasPlayer,
  getOverseasCount,
  getTotalSquadCount,
  canTeamBuyPlayer,
};
