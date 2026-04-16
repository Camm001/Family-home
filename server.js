require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ── Database ──────────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, 'family-hub.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema on boot
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// Make db available to routes
app.locals.db = db;

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) { ws.close(1008, 'Unauthorized'); return; }

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    ws.userId = payload.id;
    ws.userName = payload.name;
    clients.add(ws);

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  } catch {
    ws.close(1008, 'Unauthorized');
  }
});

// Broadcast helper — attach to app so routes can use it
app.locals.broadcast = (type, data) => {
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
};

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/photos', express.static(path.join(__dirname, 'data', 'photos')));
app.use('/data/documents', express.static(path.join(__dirname, 'data', 'documents')));

// Ensure upload dirs exist
['data/photos', 'data/documents', 'data/receipts'].forEach(dir => {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/calendar',  require('./routes/calendar'));
app.use('/api/photos',    require('./routes/photos'));
app.use('/api/board',     require('./routes/board'));
app.use('/api/links',     require('./routes/links'));
app.use('/api/shopping',  require('./routes/shopping'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/meals',     require('./routes/meals'));
app.use('/api/chores',    require('./routes/chores'));
app.use('/api/expenses',  require('./routes/expenses'));
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/recipes',   require('./routes/recipes'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/pantry',    require('./routes/pantry'));
app.use('/api/ai',        require('./routes/ai'));
app.use('/api/webhooks',  require('./routes/webhooks'));
app.use('/api/push',      require('./routes/push'));
app.use('/api/users',     require('./routes/users'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Services ──────────────────────────────────────────────────────────────────
require('./services/digest');
require('./services/reminders');
require('./services/backup');

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3085;
server.listen(PORT, () => {
  console.log(`Family Hub running on http://localhost:${PORT}`);
});
