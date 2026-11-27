// Every room has its own copy of all players and teams, so nothing one room does
// is visible to another. Documents with roomCode = null are the master templates
// loaded by seed.js; rooms are copied from them and never change them.
const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const timer = require('../socket/auctionTimer');
const acceleratedStore = require('../socket/acceleratedStore');

// Older databases have a unique index on team name alone, which would stop a
// second copy of a team being created. Replaced by the per-room index.
let indexesReady = null;
const prepareIndexes = () => {
  if (!indexesReady) {
    indexesReady = (async () => {
      try {
        await Team.collection.dropIndex('name_1');
      } catch (err) {
        if (!['IndexNotFound', 'NamespaceNotFound'].includes(err.codeName)) throw err;
      }
      await Team.createIndexes();
      await Player.createIndexes();
    })().catch((err) => {
      indexesReady = null;
      throw err;
    });
  }
  return indexesReady;
};

const withoutIdentity = ({ _id, __v, createdAt, updatedAt, ...doc }) => doc;

const resetSession = async (roomCode) => {
  const session = (await AuctionSession.findOne({ roomCode })) ?? new AuctionSession({ roomCode });
  session.status = 'waiting';
  session.currentPlayer = null;
  session.currentBid = 0;
  session.currentHighestBidder = null;
  session.bids = [];
  session.soldPlayers = [];
  session.unsoldPlayers = [];
  session.withdrawnTeams = [];
  session.timerEndsAt = null;
  session.latestRankings = null;
  session.latestVerdict = null;
  session.roomTeamAssignments = {}; // team IDs belong to the previous copy
  await session.save();
  return session;
};

// Gives the room a brand-new copy of the players and teams and a clean session.
const copyTemplates = async (roomCode) => {
  if (!roomCode) throw new Error('roomCode required');
  await prepareIndexes();

  const [players, teams] = await Promise.all([
    Player.find({ roomCode: null }).lean(),
    Team.find({ roomCode: null }).lean(),
  ]);
  if (!players.length || !teams.length) {
    throw new Error('No template players or teams found. Run "npm run seed" first.');
  }

  timer.stop(roomCode);
  acceleratedStore.reset(roomCode);
  await Promise.all([Player.deleteMany({ roomCode }), Team.deleteMany({ roomCode })]);

  await Player.insertMany(players.map((player) => ({
    ...withoutIdentity(player),
    roomCode,
    status: 'available',
    soldPrice: null,
    team: null,
  })));
  // Teams are inserted last: their presence marks the copy as complete.
  await Team.insertMany(teams.map((team) => ({
    ...withoutIdentity(team),
    roomCode,
    remainingPurse: team.purse,
    players: [],
    playing12: [],
    rating: null,
  })));

  return resetSession(roomCode);
};

// One setup at a time per room — two users joining together must not both copy.
const _pending = new Map();
const once = (roomCode, task) => {
  const previous = _pending.get(roomCode) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  _pending.set(roomCode, next);
  return next.finally(() => {
    if (_pending.get(roomCode) === next) _pending.delete(roomCode);
  });
};

// For a newly created room.
const createRoomData = (roomCode) => once(roomCode, () => copyTemplates(roomCode));

// For an existing room: copies the data only if the room has none yet.
const ensureRoomData = (roomCode) => once(roomCode, async () => {
  const [team, player] = await Promise.all([
    Team.exists({ roomCode }),
    Player.exists({ roomCode }),
  ]);
  if (!team || !player) await copyTemplates(roomCode);
});

module.exports = { createRoomData, ensureRoomData };
