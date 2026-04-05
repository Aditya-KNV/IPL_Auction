const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────────────────────
  name:          { type: String, required: true },
  nationality:   { type: String, default: 'Indian' },
  role: {
    type: String,
    enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'],
    required: true,
  },
  batting_style: { type: String, enum: ['left-handed', 'right-handed'], default: 'right-handed' },
  bowling_style: { type: String, default: '' },
  age:           { type: Number, default: 0 },

  // ── Batting ─────────────────────────────────────────────────────────────────
  batting: {
    phases: {
      powerplay: { rating: { type: Number, default: 0 }, strike_rate: { type: Number, default: 0 } },
      middle:    { rating: { type: Number, default: 0 }, strike_rate: { type: Number, default: 0 } },
      death:     { rating: { type: Number, default: 0 }, strike_rate: { type: Number, default: 0 } },
    },
    skills: {
      finishing:    { type: Number, default: 0 },
      power_hitting:{ type: Number, default: 0 },
      anchor:       { type: Number, default: 0 },
      spin_play:    { type: Number, default: 0 },
      pace_play:    { type: Number, default: 0 },
    },
  },

  // ── Bowling (optional for pure batsmen) ─────────────────────────────────────
  bowling: {
    phases: {
      powerplay: { type: Number, default: 0 },
      middle:    { type: Number, default: 0 },
      death:     { type: Number, default: 0 },
    },
    skills: {
      variations: { type: Number, default: 0 },
      yorker:     { type: Number, default: 0 },
      bouncer:    { type: Number, default: 0 },
    },
    positions: [{ type: Number }],  // [powerplay, middle, death] — 1 = designated, 0 = not
  },

  // ── Impact ──────────────────────────────────────────────────────────────────
  role_impact: {
    match_winner: { type: Number, default: 0 },
    clutch:       { type: Number, default: 0 },
    consistency:  { type: Number, default: 0 },
  },

  // ── Fitness ─────────────────────────────────────────────────────────────────
  fitness: {
    injury_risk: { type: Number, default: 5 }, // higher = more risky
    stamina:     { type: Number, default: 5 },
  },

  // ── Tactical ────────────────────────────────────────────────────────────────
  tactical: {
    flexibility:   { type: Number, default: 5 },
    positions:     [{ type: Number }],    // batting positions e.g. [1,2]
    overs:         { type: Number, default: 0 },
    captaincy:     { type: Number, default: 0 },
  },

  // ── Auction ─────────────────────────────────────────────────────────────────
  basePrice: { type: Number, required: true },
  auctionSetName:  { type: String, default: '' },
  auctionSetOrder: { type: Number, default: 999 },
  soldPrice: { type: Number, default: null },
  status: {
    type: String,
    enum: ['available', 'sold', 'unsold', 'in-auction'],
    default: 'available',
  },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  imageUrl: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Player', playerSchema);
