const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getRankings } = require('../controllers/rankingController');

// GET /api/ranking — any logged-in user (host triggers this after auction)
router.get('/', protect, getRankings);

module.exports = router;
