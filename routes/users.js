const router = require('express').Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');

// List all users
router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT id, name, email, role, color, avatar_url, created_at FROM users ORDER BY name').all();
  res.json(users);
});

// Update own profile
router.put('/me', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { name, color, password } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (color) updates.color = color;
  if (password) updates.password_hash = await bcrypt.hash(password, 12);

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...Object.values(updates), req.user.id);
  const user = db.prepare('SELECT id, name, email, role, color, avatar_url FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Admin: update any user role
router.put('/:id/role', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = req.app.locals.db;
  const { role } = req.body;
  if (!['admin', 'member', 'child'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

// Admin: delete user
router.delete('/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const db = req.app.locals.db;
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
