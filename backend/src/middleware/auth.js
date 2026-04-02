const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not authorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const auctioneerOnly = (req, res, next) => {
  if (req.user?.role !== 'auctioneer') {
    return res.status(403).json({ message: 'Auctioneer access only' });
  }
  next();
};

module.exports = { protect, auctioneerOnly };
