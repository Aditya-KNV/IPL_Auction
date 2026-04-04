const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const { protect, auctioneerOnly } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const teams = await Team.find().populate('players', 'name role soldPrice nationality');
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/teams/available — teams with no owner (public, no auth needed for register page)
router.get('/available', async (req, res) => {
  try {
    const teams = await Team.find({ owner: null }, 'name shortName color');
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('players');
    if (!team) return res.status(404).json({ message: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, auctioneerOnly, async (req, res) => {
  try {
    const team = await Team.create(req.body);
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/teams/:id/playing12  — set the playing 12 for a team
router.patch('/:id/playing12', protect, async (req, res) => {
  try {
    const { playing12 } = req.body; // array of player ObjectIds
    if (!Array.isArray(playing12))
      return res.status(400).json({ message: 'playing12 must be an array of player IDs' });
    if (playing12.length > 12)
      return res.status(400).json({ message: 'playing12 cannot exceed 12 players' });

    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { playing12 },
      { new: true }
    ).populate('players').populate('playing12');

    if (!team) return res.status(404).json({ message: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
