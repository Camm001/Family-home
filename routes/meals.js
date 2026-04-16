const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { week_start } = req.query;
  let q = `
    SELECT mp.*, r.title as recipe_title, r.ingredients_json, u.name as user_name
    FROM meal_plan mp
    LEFT JOIN recipes r ON mp.recipe_id = r.id
    JOIN users u ON mp.user_id = u.id
  `;
  const params = [];
  if (week_start) {
    q += ' WHERE mp.date >= ? AND mp.date <= date(?, "+6 days")';
    params.push(week_start, week_start);
  }
  q += ' ORDER BY mp.date, mp.meal_type';
  res.json(db.prepare(q).all(...params));
});

router.post('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { date, meal_type, recipe_id, custom_meal } = req.body;
  if (!date || !meal_type) return res.status(400).json({ error: 'date and meal_type required' });

  // Remove existing entry for same slot
  db.prepare('DELETE FROM meal_plan WHERE date = ? AND meal_type = ?').run(date, meal_type);

  if (!recipe_id && !custom_meal) {
    return res.json({ ok: true, removed: true });
  }

  const result = db.prepare('INSERT INTO meal_plan (date, meal_type, recipe_id, custom_meal, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(date, meal_type, recipe_id || null, custom_meal || null, req.user.id);
  res.json(db.prepare('SELECT mp.*, r.title as recipe_title FROM meal_plan mp LEFT JOIN recipes r ON mp.recipe_id = r.id WHERE mp.id = ?').get(result.lastInsertRowid));
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM meal_plan WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Generate shopping list from meal plan
router.post('/generate-list', auth, (req, res) => {
  const db = req.app.locals.db;
  const { week_start, list_id } = req.body;
  if (!week_start || !list_id) return res.status(400).json({ error: 'week_start and list_id required' });

  const meals = db.prepare(`
    SELECT r.ingredients_json FROM meal_plan mp
    JOIN recipes r ON mp.recipe_id = r.id
    WHERE mp.date >= ? AND mp.date <= date(?, "+6 days") AND mp.recipe_id IS NOT NULL
  `).all(week_start, week_start);

  const ingredients = new Set();
  meals.forEach(m => {
    try {
      const items = JSON.parse(m.ingredients_json);
      items.forEach(i => ingredients.add(typeof i === 'string' ? i : i.name || JSON.stringify(i)));
    } catch {}
  });

  const insert = db.prepare('INSERT INTO list_items (list_id, text, added_by) VALUES (?, ?, ?)');
  const insertMany = db.transaction(items => {
    for (const text of items) insert.run(list_id, text, req.user.id);
  });
  insertMany([...ingredients]);

  res.json({ added: ingredients.size });
});

module.exports = router;
