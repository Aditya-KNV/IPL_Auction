const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  shortName: { type: String, required: true },
  owner:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  purse:          { type: Number, required: true },
  remainingPurse: { type: Number },
  players:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  playing12:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }], // selected XI/XII
  maxPlayers: { type: Number, default: 25 },
  logoUrl:    { type: String, default: '' },
  color:      { type: String, default: '#000000' },
  rating:     { type: Number, default: null }, // 0-100, set by Claude after auction
}, { timestamps: true });

teamSchema.pre('save', function (next) {
  if (this.isNew) this.remainingPurse = this.purse;
  next();
});

module.exports = mongoose.model('Team', teamSchema);
