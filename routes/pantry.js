const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  res.json(db.prepare('SELECT p.*, l.name as list_name, u.name as updated_by_name FROM pantry_items p LEFT JOIN lists l ON p.list_id = l.id LEFT JOIN users u ON p.updated_by = u.id ORDER BY p.name').all());
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { name, threshold, current_stock, unit, auto_add_to_list, list_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO pantry_items (name, threshold, current_stock, unit, auto_add_to_list, list_id, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, threshold || 1, current_stock !== undefined ? current_stock : 1, unit || 'unit', auto_add_to_list ? 1 : 0, list_id || null, req.user.id);
  res.json(db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const item = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { name, threshold, current_stock, unit, auto_add_to_list, list_id } = req.body;

  db.prepare('UPDATE pantry_items SET name=?, threshold=?, current_stock=?, unit=?, auto_add_to_list=?, list_id=?, updated_by=?, updated_at=datetime("now") WHERE id=?')
    .run(name || item.name, threshold !== undefined ? threshold : item.threshold,
      current_stock !== undefined ? current_stock : item.current_stock,
      unit || item.unit, auto_add_to_list ? 1 : 0, list_id !== undefined ? list_id : item.list_id, req.user.id, req.params.id);

  const updated = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(req.params.id);

  // Auto-add to shopping list if stock drops at or below threshold
  if (updated.auto_add_to_list && updated.list_id && updated.current_stock <= updated.threshold) {
    const existing = db.prepare('SELECT id FROM list_items WHERE list_id = ? AND text = ? AND checked = 0').get(updated.list_id, updated.name);
    if (!existing) {
      db.prepare('INSERT INTO list_items (list_id, text, added_by) VALUES (?, ?, ?)').run(updated.list_id, updated.name, req.user.id);
      req.app.locals.broadcast('shopping:item_added', { list_id: updated.list_id, item: { text: updated.name } });
    }
  }

  res.json(updated);
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM pantry_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// "We're out" quick action
router.post('/:id/out', auth, (req, res) => {
  const db = req.app.locals.db;
  const item = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE pantry_items SET current_stock=0, updated_by=?, updated_at=datetime("now") WHERE id=?').run(req.user.id, req.params.id);

  if (item.auto_add_to_list && item.list_id) {
    const existing = db.prepare('SELECT id FROM list_items WHERE list_id = ? AND text = ? AND checked = 0').get(item.list_id, item.name);
    if (!existing) {
      db.prepare('INSERT INTO list_items (list_id, text, added_by) VALUES (?, ?, ?)').run(item.list_id, item.name, req.user.id);
      req.app.locals.broadcast('shopping:item_added', { list_id: item.list_id, item: { text: item.name } });
    }
  }
  res.json({ ok: true });
});

module.exports = router;
