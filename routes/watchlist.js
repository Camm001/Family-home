const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { type, watched } = req.query;
  let q = 'SELECT w.*, u.name as added_by_name FROM watchlist w JOIN users u ON w.added_by = u.id';
  const conds = [], params = [];
  if (type) { conds.push('w.type = ?'); params.push(type); }
  if (watched !== undefined) { conds.push('w.watched = ?'); params.push(watched === 'true' ? 1 : 0); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY w.watched ASC, w.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { title, type, year, description, poster_url } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO watchlist (user_id, title, type, year, description, poster_url, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, type || 'movie', year || null, description || null, poster_url || null, req.user.id);
  res.json(db.prepare('SELECT * FROM watchlist WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id/watched', auth, (req, res) => {
  const db = req.app.locals.db;
  const { watched } = req.body;
  db.prepare('UPDATE watchlist SET watched=?, watched_at=? WHERE id=?').run(watched ? 1 : 0, watched ? new Date().toISOString() : null, req.params.id);
  res.json(db.prepare('SELECT * FROM watchlist WHERE id = ?').get(req.params.id));
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
