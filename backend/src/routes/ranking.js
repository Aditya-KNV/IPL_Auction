const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getRankings, generateRankings } = require('../controllers/rankingController');

// GET /api/ranking — any logged-in user can view the currently saved rankings
router.get('/', protect, getRankings);

// POST /api/ranking — ONLY room host can generate new rankings
router.post('/', protect, generateRankings);

module.exports = router;
