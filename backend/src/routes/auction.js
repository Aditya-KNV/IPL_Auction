const express = require('express');
const router  = express.Router();
const { getSession, startAuction, pauseAuction, resumeAuction, endAuction } = require('../controllers/auctionController');
const { protect } = require('../middleware/auth');
const { getRawRoomByCode } = require('../socket/roomStore');

// Only the host of a room may control its auction.
const hostOnly = (req, res, next) => {
  const room = getRawRoomByCode(req.body.roomCode);
  if (!room || room.hostUserId !== String(req.user.id)) {
    return res.status(403).json({ message: 'Only the room host can control the auction.' });
  }
  next();
};

router.get('/session',  protect, getSession);
router.post('/start',   protect, hostOnly, startAuction);
router.post('/pause',   protect, hostOnly, pauseAuction);
router.post('/resume',  protect, hostOnly, resumeAuction);
router.post('/end',     protect, hostOnly, endAuction);

module.exports = router;
