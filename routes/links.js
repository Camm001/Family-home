const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { category } = req.query;
  let q = 'SELECT l.*, u.name as user_name FROM links l JOIN users u ON l.user_id = u.id';
  const params = [];
  if (category) { q += ' WHERE l.category = ?'; params.push(category); }
  q += ' ORDER BY l.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', auth, async (req, res) => {
  const db = req.app.locals.db;
  const { title, url, description, category } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'title and url required' });

  let favicon_url = null;
  try {
    const domain = new URL(url).hostname;
    favicon_url = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {}

  const result = db.prepare('INSERT INTO links (user_id, title, url, description, category, favicon_url) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, url, description || null, category || null, favicon_url);
  res.json(db.prepare('SELECT l.*, u.name as user_name FROM links l JOIN users u ON l.user_id = u.id WHERE l.id = ?').get(result.lastInsertRowid));
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (link.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
