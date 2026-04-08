const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  team:      { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  amount:    { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

const auctionSessionSchema = new mongoose.Schema({
  roomCode: { type: String, required: true },
  status: {
    type:    String,
    enum:    ['waiting', 'active', 'paused', 'completed'],
    default: 'waiting',
  },
  currentPlayer:        { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  currentBid:           { type: Number, default: 0 },
  currentHighestBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  bids:                 [bidSchema],               // full bid log for current player
  soldPlayers:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  unsoldPlayers:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  withdrawnTeams:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  timerDuration:        { type: Number, default: 10 },   // seconds for the first window
  timerEndsAt:          { type: Date,   default: null },  // absolute deadline, for reconnects
  latestRankings:       { type: mongoose.Schema.Types.Mixed, default: null }, // Persisted latest ranking data
  latestVerdict:        { type: String, default: null },
  // Room metadata — persisted so the room can be restored after a server restart
  roomHostUserId:       { type: String, default: null },
  roomTeamAssignments:  { type: mongoose.Schema.Types.Mixed, default: {} }, // { [userId]: { teamId, name, shortName, color, claimedBy } }
}, { timestamps: true });

// Primary lookup key for every bid and session query
auctionSessionSchema.index({ roomCode: 1 });
// Speeds up the atomic findOneAndUpdate filter during bidding
auctionSessionSchema.index({ roomCode: 1, status: 1, currentPlayer: 1 });

module.exports = mongoose.model('AuctionSession', auctionSessionSchema);
