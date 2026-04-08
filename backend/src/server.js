const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

dotenv.config();
connectDB();

// Prevent unhandled promise rejections from crashing the process.
// Log them instead so the server stays up for all connected clients.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
});

const app = express();
const server = http.createServer(app);

// Init Socket.IO
initSocket(server);

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());

// Health check — keeps Render free tier awake when pinged by an uptime monitor
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/auction', require('./routes/auction'));
app.use('/api/rooms',   require('./routes/rooms'));
app.use('/api/ranking', require('./routes/ranking'));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../../frontend/build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) =>
    res.sendFile(path.join(buildPath, 'index.html'))
  );
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
