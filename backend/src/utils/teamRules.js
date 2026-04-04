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

const canTeamBuyPlayer = async (teamId, player) => {
  if (!isOverseasPlayer(player)) {
    return { allowed: true, overseasCount: 0 };
  }

  const team = await Team.findById(teamId).select('maxPlayers').lean();
  const maxOverseasSquad = getOverseasSquadCap(team?.maxPlayers ?? 25);

  const [overseasCount, totalCount] = await Promise.all([
    getOverseasCount(teamId),
    getTotalSquadCount(teamId),
  ]);

  // Enforce dynamic squad-level overseas cap only — no early playing-12 cap
  // during bidding. The playing-12 overseas constraint (max 4) is enforced
  // when selecting the playing 12, not at purchase time.
  if (overseasCount >= maxOverseasSquad) {
    return {
      allowed: false,
      reason: 'squad',
      overseasCount,
      totalCount,
      cap: maxOverseasSquad,
    };
  }

  return { allowed: true, overseasCount, totalCount };
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
