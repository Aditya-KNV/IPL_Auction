const AuctionSession = require('../models/AuctionSession');
const Player = require('../models/Player');
const Team = require('../models/Team');
const timer = require('../socket/auctionTimer');

const resetAuctionState = async (io) => {
  timer.stop();

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

  let session = await AuctionSession.findOne();
  if (!session) {
    session = new AuctionSession();
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
  await session.save();

  if (io) {
    io.emit('auction:status', { status: 'waiting' });
  }

  return session;
};

module.exports = { resetAuctionState };
