const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const register = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });
  if (username.trim().length < 3)
    return res.status(400).json({ message: 'Username must be at least 3 characters' });
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ message: 'Invalid email address' });
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });

  try {
    const emailTaken    = await User.findOne({ email });
    if (emailTaken)    return res.status(400).json({ message: 'Email already in use' });

    const usernameTaken = await User.findOne({ username });
    if (usernameTaken) return res.status(400).json({ message: 'Username already taken' });

    const user = await User.create({ username: username.trim(), email, password });
    res.status(201).json({
      token: generateToken(user._id),
      user:  { id: user._id, username: user.username, email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    res.json({
      token: generateToken(user._id),
      user:  { id: user._id, username: user.username, email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMe = async (req, res) => {
  res.json({
    id:       req.user._id,
    username: req.user.username,
    email:    req.user.email,
  });
};

module.exports = { register, login, getMe };
