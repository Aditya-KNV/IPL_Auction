const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  team:      { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  amount:    { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

const auctionSessionSchema = new mongoose.Schema({
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
  timerDuration:        { type: Number, default: 10 },   // seconds for the first window
  timerEndsAt:          { type: Date,   default: null },  // absolute deadline, for reconnects
}, { timestamps: true });

module.exports = mongoose.model('AuctionSession', auctionSessionSchema);
