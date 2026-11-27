const Player = require('../models/Player');
// Every query is limited to one room. Without a roomCode only the master
// templates are visible, never another room's data.
const roomOf = (req) => req.query.roomCode || null;

const getPlayers = async (req, res) => {
  try {
    const { role, status, team, auctionSetName } = req.query;
    const filter = { roomCode: roomOf(req) };

    if (role) filter.role = role;
    if (status) filter.status = status;
    if (team) filter.team = team;
    if (auctionSetName) filter.auctionSetName = auctionSetName;

    const players = await Player.find(filter).populate('team', 'name shortName color');
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The room's auction sets, in the order they come up.
const getSets = async (req, res) => {
  try {
    const sets = await Player.aggregate([
      { $match: { roomCode: roomOf(req) } },
      { $group: { _id: '$auctionSetName', order: { $min: '$auctionSetOrder' } } },
      { $sort: { order: 1, _id: 1 } },
    ]);
    res.json(sets.map((set) => set._id).filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getPlayer = async (req, res) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, roomCode: roomOf(req) }).populate('team');
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createPlayer = async (req, res) => {
  try {
    const player = await Player.create({ ...req.body, roomCode: null });
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const updatePlayer = async (req, res) => {
  try {
    const player = await Player.findOneAndUpdate(
      { _id: req.params.id, roomCode: null },
      { ...req.body, roomCode: null },
      { new: true }
    );
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const deletePlayer = async (req, res) => {
  try {
    await Player.findOneAndDelete({ _id: req.params.id, roomCode: null });
    res.json({ message: 'Player deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPlayers, getSets, getPlayer, createPlayer, updatePlayer, deletePlayer };
