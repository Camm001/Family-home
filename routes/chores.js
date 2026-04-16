const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const chores = db.prepare(`
    SELECT c.*, u.name as assigned_name, u.color as assigned_color,
      cb.name as completed_by_name, cr.name as created_by_name
    FROM chores c
    LEFT JOIN users u ON c.assigned_to = u.id
    LEFT JOIN users cb ON c.completed_by = cb.id
    JOIN users cr ON c.created_by = cr.id
    ORDER BY c.completed_at IS NOT NULL, c.due_date ASC
  `).all();
  res.json(chores);
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { title, assigned_to, frequency, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO chores (title, assigned_to, frequency, due_date, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(title, assigned_to || null, frequency || 'once', due_date || null, req.user.id);
  const chore = db.prepare(`
    SELECT c.*, u.name as assigned_name FROM chores c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid);

  // Notify assigned user via push
  if (assigned_to) {
    try { require('../services/push').sendToUser(req.app.locals.db, assigned_to, { title: 'New chore assigned', body: title }); } catch {}
  }

  req.app.locals.broadcast('chore:new', chore);
  res.json(chore);
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);
  if (!chore) return res.status(404).json({ error: 'Not found' });
  const { title, assigned_to, frequency, due_date } = req.body;
  db.prepare('UPDATE chores SET title=?, assigned_to=?, frequency=?, due_date=? WHERE id=?')
    .run(title || chore.title, assigned_to !== undefined ? assigned_to : chore.assigned_to,
      frequency || chore.frequency, due_date !== undefined ? due_date : chore.due_date, req.params.id);
  res.json(db.prepare('SELECT c.*, u.name as assigned_name FROM chores c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.id = ?').get(req.params.id));
});

router.post('/:id/complete', auth, (req, res) => {
  const db = req.app.locals.db;
  const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(req.params.id);
  if (!chore) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE chores SET completed_at=datetime("now"), completed_by=? WHERE id=?').run(req.user.id, req.params.id);

  // Regenerate recurring chores
  if (chore.frequency !== 'once' && chore.due_date) {
    const next = getNextDueDate(chore.due_date, chore.frequency);
    db.prepare('INSERT INTO chores (title, assigned_to, frequency, due_date, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(chore.title, chore.assigned_to, chore.frequency, next, chore.created_by);
  }

  req.app.locals.broadcast('chore:completed', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM chores WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function getNextDueDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1); break;
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'biweekly':  d.setDate(d.getDate() + 14); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    default: return date;
  }
  return d.toISOString().split('T')[0];
}

module.exports = router;
