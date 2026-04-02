const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getRoom, roomExists } = require('../socket/roomStore');

// GET /api/rooms/:code — check if a room exists and return its public info
router.get('/:code', protect, (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!roomExists(code)) {
    return res.status(404).json({ message: 'Room not found' });
  }
  const room = getRoom(code);
  res.json({ code: room.code, userCount: room.users.length, createdAt: room.createdAt });
});

module.exports = router;
