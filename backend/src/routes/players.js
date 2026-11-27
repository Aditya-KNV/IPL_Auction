const express = require('express');
const router = express.Router();
const { getPlayers, getSets, getPlayer, createPlayer, updatePlayer, deletePlayer } = require('../controllers/playerController');
const { protect, auctioneerOnly } = require('../middleware/auth');

router.get('/', protect, getPlayers);
router.get('/sets', protect, getSets); // must come before /:id
router.get('/:id', protect, getPlayer);
router.post('/', protect, auctioneerOnly, createPlayer);
router.put('/:id', protect, auctioneerOnly, updatePlayer);
router.delete('/:id', protect, auctioneerOnly, deletePlayer);

module.exports = router;
