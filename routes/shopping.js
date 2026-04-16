const router = require('express').Router();
const auth = require('../middleware/auth');

// Lists
router.get('/lists', auth, (req, res) => {
  const db = req.app.locals.db;
  const lists = db.prepare(`
    SELECT l.*, u.name as created_by_name,
      COUNT(CASE WHEN li.checked = 0 THEN 1 END) as pending_count,
      COUNT(li.id) as total_count
    FROM lists l
    JOIN users u ON l.created_by = u.id
    LEFT JOIN list_items li ON li.list_id = l.id
    GROUP BY l.id ORDER BY l.created_at DESC
  `).all();
  res.json(lists);
});

router.post('/lists', auth, (req, res) => {
  const db = req.app.locals.db;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO lists (name, created_by) VALUES (?, ?)').run(name, req.user.id);
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/lists/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Items
router.get('/lists/:id/items', auth, (req, res) => {
  const db = req.app.locals.db;
  const items = db.prepare(`
    SELECT i.*, u.name as added_by_name, ub.name as checked_by_name
    FROM list_items i
    LEFT JOIN users u ON i.added_by = u.id
    LEFT JOIN users ub ON i.checked_by = ub.id
    WHERE i.list_id = ?
    ORDER BY i.checked ASC, i.created_at ASC
  `).all(req.params.id);
  res.json(items);
});

router.post('/lists/:id/items', auth, (req, res) => {
  const db = req.app.locals.db;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const result = db.prepare('INSERT INTO list_items (list_id, text, added_by) VALUES (?, ?, ?)').run(req.params.id, text, req.user.id);
  const item = db.prepare('SELECT i.*, u.name as added_by_name FROM list_items i LEFT JOIN users u ON i.added_by = u.id WHERE i.id = ?').get(result.lastInsertRowid);
  req.app.locals.broadcast('shopping:item_added', { list_id: parseInt(req.params.id), item });
  res.json(item);
});

router.put('/items/:id/check', auth, (req, res) => {
  const db = req.app.locals.db;
  const { checked } = req.body;
  db.prepare('UPDATE list_items SET checked=?, checked_by=?, updated_at=datetime("now") WHERE id=?')
    .run(checked ? 1 : 0, checked ? req.user.id : null, req.params.id);
  const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id);
  req.app.locals.broadcast('shopping:item_checked', { item });
  res.json(item);
});

router.delete('/items/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.id);
  req.app.locals.broadcast('shopping:item_deleted', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

router.delete('/lists/:id/checked', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM list_items WHERE list_id = ? AND checked = 1').run(req.params.id);
  req.app.locals.broadcast('shopping:cleared_checked', { list_id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
