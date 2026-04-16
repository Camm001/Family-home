const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  res.json(db.prepare('SELECT r.*, u.name as user_name FROM reminders r JOIN users u ON r.user_id = u.id ORDER BY r.date').all());
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { title, reminder_type, date, recur_yearly, days_before } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title and date required' });
  const result = db.prepare('INSERT INTO reminders (user_id, title, reminder_type, date, recur_yearly, days_before) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, reminder_type || 'custom', date, recur_yearly ? 1 : 0, days_before || 7);
  res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const r = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { title, reminder_type, date, recur_yearly, days_before } = req.body;
  db.prepare('UPDATE reminders SET title=?, reminder_type=?, date=?, recur_yearly=?, days_before=? WHERE id=?')
    .run(title || r.title, reminder_type || r.reminder_type, date || r.date, recur_yearly ? 1 : 0, days_before || r.days_before, req.params.id);
  res.json(db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id));
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const r = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
