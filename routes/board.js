const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const posts = db.prepare(`
    SELECT p.*, u.name as user_name, u.color as user_color,
      (SELECT json_group_array(json_object('emoji', r.emoji, 'count', r.cnt))
       FROM (SELECT emoji, COUNT(*) as cnt FROM reactions WHERE post_id = p.id GROUP BY emoji) r) as reactions_json
    FROM posts p JOIN users u ON p.user_id = u.id
    ORDER BY p.pinned DESC, p.created_at DESC
  `).all();

  const myReactions = db.prepare('SELECT post_id, emoji FROM reactions WHERE user_id = ?').all(req.user.id);
  const myMap = {};
  myReactions.forEach(r => {
    if (!myMap[r.post_id]) myMap[r.post_id] = [];
    myMap[r.post_id].push(r.emoji);
  });

  res.json(posts.map(p => ({
    ...p,
    reactions: JSON.parse(p.reactions_json || '[]'),
    my_reactions: myMap[p.id] || []
  })));
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  const result = db.prepare('INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)').run(req.user.id, title, body);
  const post = db.prepare('SELECT p.*, u.name as user_name FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(result.lastInsertRowid);
  req.app.locals.broadcast('post:new', { ...post, reactions: [], my_reactions: [] });
  res.json(post);
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { title, body, pinned } = req.body;
  const isPinned = (req.user.role === 'admin' && pinned !== undefined) ? (pinned ? 1 : 0) : post.pinned;
  db.prepare('UPDATE posts SET title=?, body=?, pinned=?, updated_at=datetime("now") WHERE id=?').run(title || post.title, body || post.body, isPinned, req.params.id);
  const updated = db.prepare('SELECT p.*, u.name as user_name FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(req.params.id);
  req.app.locals.broadcast('post:update', updated);
  res.json(updated);
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  req.app.locals.broadcast('post:delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

// Reactions
router.post('/:id/react', auth, (req, res) => {
  const db = req.app.locals.db;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });

  const existing = db.prepare('SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?').get(req.params.id, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO reactions (post_id, user_id, emoji) VALUES (?, ?, ?)').run(req.params.id, req.user.id, emoji);
  }

  const counts = db.prepare('SELECT emoji, COUNT(*) as count FROM reactions WHERE post_id = ? GROUP BY emoji').all(req.params.id);
  req.app.locals.broadcast('post:react', { post_id: parseInt(req.params.id), reactions: counts });
  res.json({ reactions: counts });
});

module.exports = router;
