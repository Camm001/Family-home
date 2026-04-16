const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

// Register (open if 0 users, otherwise needs invite token)
router.post('/register', async (req, res) => {
  const db = req.app.locals.db;
  const { name, email, password, token } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

  if (userCount > 0) {
    if (!token) return res.status(403).json({ error: 'Invite token required' });
    const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ? AND used_by IS NULL AND expires_at > datetime("now")').get(token);
    if (!invite) return res.status(403).json({ error: 'Invalid or expired invite token' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 12);
  const role = userCount === 0 ? 'admin' : 'member';

  const result = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role);

  if (userCount > 0 && token) {
    db.prepare('UPDATE invite_tokens SET used_by = ? WHERE token = ?').run(result.lastInsertRowid, token);
  }

  const jwtToken = jwt.sign({ id: result.lastInsertRowid, name, email, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token: jwtToken, user: { id: result.lastInsertRowid, name, email, role } });
});

// Login
router.post('/login', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, color: user.color, avatar_url: user.avatar_url } });
});

// Create invite (admin only)
router.post('/invite', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = req.app.locals.db;
  const crypto = require('crypto');
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO invite_tokens (token, created_by, expires_at) VALUES (?, ?, ?)').run(token, req.user.id, expires);
  res.json({ token, expires_at: expires });
});

// List pending invites (admin only)
router.get('/invites', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = req.app.locals.db;
  const invites = db.prepare(`
    SELECT i.token, i.expires_at, i.created_at, u.name as created_by_name
    FROM invite_tokens i
    JOIN users u ON u.id = i.created_by
    WHERE i.used_by IS NULL AND i.expires_at > datetime('now')
    ORDER BY i.created_at DESC
  `).all();
  res.json(invites);
});

// Revoke a pending invite (admin only)
router.delete('/invites/:token', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = req.app.locals.db;
  db.prepare('DELETE FROM invite_tokens WHERE token = ? AND used_by IS NULL').run(req.params.token);
  res.json({ ok: true });
});

// Get current user
router.get('/me', auth, (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, name, email, role, color, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
