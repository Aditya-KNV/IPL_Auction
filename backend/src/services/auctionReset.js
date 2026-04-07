const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const timer = require('../socket/auctionTimer');
const acceleratedStore = require('../socket/acceleratedStore');

const resetAuctionState = async (io, roomCode) => {
  timer.stop(roomCode);
  acceleratedStore.reset(roomCode);

  await Player.updateMany(
    {},
    {
      $set: {
        status: 'available',
        soldPrice: null,
        team: null,
      },
    }
  );

  const teams = await Team.find().select('_id purse');
  await Promise.all(
    teams.map((team) =>
      Team.findByIdAndUpdate(team._id, {
        $set: {
          remainingPurse: team.purse,
          players: [],
          playing12: [],
          rating: null,
        },
      })
    )
  );

  let session = await AuctionSession.findOne({ roomCode });
  if (!session) {
    session = new AuctionSession({ roomCode });
  }

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
  await session.save();

  if (io) {
    io.to(roomCode).emit('auction:status', { status: 'waiting' });
    io.to(roomCode).emit('auction:rankings-updated');
  }

  return session;
};

module.exports = { resetAuctionState };
