const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const isAdult = req.user.role !== 'child';
  const q = isAdult
    ? 'SELECT d.*, u.name as user_name FROM documents d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC'
    : 'SELECT d.*, u.name as user_name FROM documents d JOIN users u ON d.user_id = u.id WHERE d.visible_to = "all" ORDER BY d.created_at DESC';
  res.json(db.prepare(q).all());
});

router.post('/', auth, upload.document.single('file'), (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { title, category, visible_to } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const result = db.prepare(
    'INSERT INTO documents (user_id, title, filename, original_name, category, visible_to) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, title, req.file.filename, req.file.originalname, category || 'other', visible_to || 'all');

  // Copy to Paperless consume dir if configured
  if (process.env.PAPERLESS_CONSUME_PATH) {
    try {
      fs.copyFileSync(
        path.join(__dirname, '..', 'data', 'documents', req.file.filename),
        path.join(process.env.PAPERLESS_CONSUME_PATH, req.file.filename)
      );
    } catch (e) { console.warn('Paperless copy failed:', e.message); }
  }

  res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { title, category, visible_to, summary } = req.body;
  db.prepare('UPDATE documents SET title=?, category=?, visible_to=?, summary=? WHERE id=?')
    .run(title || doc.title, category || doc.category, visible_to || doc.visible_to, summary !== undefined ? summary : doc.summary, req.params.id);
  res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id));
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try { fs.unlinkSync(path.join(__dirname, '..', 'data', 'documents', doc.filename)); } catch {}
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
