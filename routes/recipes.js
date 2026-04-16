const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  res.json(db.prepare('SELECT r.*, u.name as user_name FROM recipes r JOIN users u ON r.user_id = u.id ORDER BY r.title').all());
});

router.get('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const recipe = db.prepare('SELECT r.*, u.name as user_name FROM recipes r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  res.json({ ...recipe, ingredients: JSON.parse(recipe.ingredients_json || '[]') });
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { title, ingredients, instructions, servings, tags, source_url } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare(
    'INSERT INTO recipes (user_id, title, ingredients_json, instructions, servings, tags, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, title, JSON.stringify(ingredients || []), instructions || null, servings || null, tags || null, source_url || null);
  res.json(db.prepare('SELECT * FROM recipes WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  if (recipe.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { title, ingredients, instructions, servings, tags, source_url } = req.body;
  db.prepare('UPDATE recipes SET title=?, ingredients_json=?, instructions=?, servings=?, tags=?, source_url=? WHERE id=?')
    .run(title, JSON.stringify(ingredients || []), instructions || null, servings || null, tags || null, source_url || null, req.params.id);
  res.json(db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  if (recipe.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
