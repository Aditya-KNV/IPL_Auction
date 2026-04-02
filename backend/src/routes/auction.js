const express = require('express');
const router  = express.Router();
const { getSession, startAuction, pauseAuction, resumeAuction, endAuction } = require('../controllers/auctionController');
const { protect } = require('../middleware/auth');

router.get('/session',  protect, getSession);
router.post('/start',   protect, startAuction);
router.post('/pause',   protect, pauseAuction);
router.post('/resume',  protect, resumeAuction);
router.post('/end',     protect, endAuction);

module.exports = router;
