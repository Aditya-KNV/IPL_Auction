const Player = require('../models/Player');
const AuctionSession = require('../models/AuctionSession');

const getPlayers = async (req, res) => {
  try {
    const { role, status, team, auctionSetName } = req.query;
    const filter = {};
    let unsoldPlayerIds = null;

    if (status === 'unsold' || status === 'available') {
      const session = await AuctionSession.findOne().select('unsoldPlayers');
      unsoldPlayerIds = (session?.unsoldPlayers || []).map((id) => String(id));
    }

    if (role) filter.role = role;
    if (status) {
      if (status === 'unsold') {
        filter._id = { $in: unsoldPlayerIds || [] };
      } else if (status === 'available') {
        filter.status = 'available';
        if (unsoldPlayerIds?.length) {
          filter._id = { $nin: unsoldPlayerIds };
        }
      } else {
        filter.status = status;
      }
    }
    if (team) filter.team = team;
    if (auctionSetName) filter.auctionSetName = auctionSetName;

    const players = await Player.find(filter).populate('team', 'name shortName color');
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).populate('team');
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createPlayer = async (req, res) => {
  try {
    const player = await Player.create(req.body);
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const updatePlayer = async (req, res) => {
  try {
    const player = await Player.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const deletePlayer = async (req, res) => {
  try {
    await Player.findByIdAndDelete(req.params.id);
    res.json({ message: 'Player deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer };
