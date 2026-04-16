const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { start, end } = req.query;
  let q = 'SELECT e.*, u.name as user_name, u.color as user_color FROM events e JOIN users u ON e.user_id = u.id';
  const params = [];
  if (start && end) {
    q += ' WHERE e.start_datetime >= ? AND e.start_datetime <= ?';
    params.push(start, end);
  }
  q += ' ORDER BY e.start_datetime';
  res.json(db.prepare(q).all(...params));
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { title, start_datetime, end_datetime, all_day, color, description, recurring, recur_rule } = req.body;
  if (!title || !start_datetime) return res.status(400).json({ error: 'title and start_datetime required' });

  const result = db.prepare(
    'INSERT INTO events (title, start_datetime, end_datetime, all_day, color, user_id, description, recurring, recur_rule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(title, start_datetime, end_datetime || null, all_day ? 1 : 0, color || req.user.color || '#6366f1', req.user.id, description || null, recurring ? 1 : 0, recur_rule || null);

  const event = db.prepare('SELECT e.*, u.name as user_name FROM events e JOIN users u ON e.user_id = u.id WHERE e.id = ?').get(result.lastInsertRowid);
  req.app.locals.broadcast('event:new', event);
  res.json(event);
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  if (event.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { title, start_datetime, end_datetime, all_day, color, description, recurring, recur_rule } = req.body;
  db.prepare('UPDATE events SET title=?, start_datetime=?, end_datetime=?, all_day=?, color=?, description=?, recurring=?, recur_rule=? WHERE id=?')
    .run(title, start_datetime, end_datetime || null, all_day ? 1 : 0, color, description || null, recurring ? 1 : 0, recur_rule || null, req.params.id);

  const updated = db.prepare('SELECT e.*, u.name as user_name FROM events e JOIN users u ON e.user_id = u.id WHERE e.id = ?').get(req.params.id);
  req.app.locals.broadcast('event:update', updated);
  res.json(updated);
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  if (event.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  req.app.locals.broadcast('event:delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
