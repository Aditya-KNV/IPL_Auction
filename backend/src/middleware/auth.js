const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Cache user documents to avoid a DB round-trip on every API request.
// TTL: 5 minutes — short enough to pick up role changes, long enough to
// eliminate the per-request DB hit under heavy auction load.
const _userCache = new Map(); // userId (string) → { user, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCachedUser = async (userId) => {
  const cached = _userCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.user;
  const user = await User.findById(userId).select('-password');
  if (user) _userCache.set(userId, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  return user;
};

const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not authorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await getCachedUser(decoded.id);
    if (!req.user) return res.status(401).json({ message: 'User not found' });
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
