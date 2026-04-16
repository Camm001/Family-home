const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Albums
router.get('/albums', auth, (req, res) => {
  const db = req.app.locals.db;
  const albums = db.prepare(`
    SELECT a.*, u.name as user_name, COUNT(p.id) as photo_count
    FROM albums a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN photos p ON p.album_id = a.id
    GROUP BY a.id ORDER BY a.created_at DESC
  `).all();
  res.json(albums);
});

router.post('/albums', auth, (req, res) => {
  const db = req.app.locals.db;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO albums (name, user_id) VALUES (?, ?)').run(name, req.user.id);
  res.json(db.prepare('SELECT * FROM albums WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/albums/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Not found' });
  if (album.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Photos
router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { album_id } = req.query;
  let q = 'SELECT p.*, u.name as user_name FROM photos p JOIN users u ON p.user_id = u.id';
  const params = [];
  if (album_id) { q += ' WHERE p.album_id = ?'; params.push(album_id); }
  q += ' ORDER BY p.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', auth, upload.photo.single('photo'), (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { album_id, caption, taken_at } = req.body;
  const result = db.prepare(
    'INSERT INTO photos (album_id, user_id, filename, original_name, caption, taken_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(album_id || null, req.user.id, req.file.filename, req.file.originalname, caption || null, taken_at || null);

  if (album_id) {
    const count = db.prepare('SELECT COUNT(*) as c FROM photos WHERE album_id = ?').get(album_id).c;
    if (count === 1) db.prepare('UPDATE albums SET cover_photo_id = ? WHERE id = ?').run(result.lastInsertRowid, album_id);
  }

  const photo = db.prepare('SELECT p.*, u.name as user_name FROM photos p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(result.lastInsertRowid);
  req.app.locals.broadcast('photo:new', photo);
  res.json(photo);
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  if (photo.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const fs = require('fs');
  const path = require('path');
  try { fs.unlinkSync(path.join(__dirname, '..', 'data', 'photos', photo.filename)); } catch {}

  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
