const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Categories
router.get('/categories', auth, (req, res) => {
  res.json(req.app.locals.db.prepare('SELECT * FROM expense_categories ORDER BY name').all());
});

router.post('/categories', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = req.app.locals.db;
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare('INSERT INTO expense_categories (name, color) VALUES (?, ?)').run(name, color || '#6366f1');
  res.json(db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(result.lastInsertRowid));
});

// Budgets
router.get('/budgets', auth, (req, res) => {
  res.json(req.app.locals.db.prepare('SELECT b.*, c.name as category_name, c.color FROM budgets b JOIN expense_categories c ON b.category_id = c.id').all());
});

router.put('/budgets/:category_id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = req.app.locals.db;
  const { monthly_limit } = req.body;
  db.prepare('INSERT INTO budgets (category_id, monthly_limit) VALUES (?, ?) ON CONFLICT(category_id) DO UPDATE SET monthly_limit = excluded.monthly_limit')
    .run(req.params.category_id, monthly_limit);
  res.json({ ok: true });
});

// Expenses
router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { month } = req.query; // YYYY-MM
  let q = 'SELECT e.*, u.name as user_name, c.name as category_name, c.color as category_color FROM expenses e JOIN users u ON e.user_id = u.id LEFT JOIN expense_categories c ON e.category_id = c.id';
  const params = [];
  if (month) { q += ' WHERE strftime("%Y-%m", e.date) = ?'; params.push(month); }
  q += ' ORDER BY e.date DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', auth, upload.receipt.single('receipt'), (req, res) => {
  const db = req.app.locals.db;
  const { amount, description, category_id, date } = req.body;
  if (!amount || !description || !date) return res.status(400).json({ error: 'amount, description, date required' });
  const result = db.prepare('INSERT INTO expenses (user_id, amount, description, category_id, date, receipt_filename) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, parseFloat(amount), description, category_id || null, date, req.file ? req.file.filename : null);

  const expense = db.prepare('SELECT e.*, c.name as category_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id = c.id WHERE e.id = ?').get(result.lastInsertRowid);

  // Outbound N8N webhook
  if (process.env.N8N_WEBHOOK_URL) {
    fetch(process.env.N8N_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'expense_logged', expense }) }).catch(() => {});
  }

  res.json(expense);
});

router.delete('/:id', auth, (req, res) => {
  const db = req.app.locals.db;
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Not found' });
  if (expense.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Monthly summary
router.get('/summary', auth, (req, res) => {
  const db = req.app.locals.db;
  const { month } = req.query;
  const m = month || new Date().toISOString().slice(0, 7);
  const byCategory = db.prepare(`
    SELECT c.id, c.name, c.color, COALESCE(SUM(e.amount), 0) as total
    FROM expense_categories c
    LEFT JOIN expenses e ON e.category_id = c.id AND strftime('%Y-%m', e.date) = ?
    GROUP BY c.id ORDER BY total DESC
  `).all(m);
  const totalSpend = byCategory.reduce((s, c) => s + c.total, 0);
  res.json({ month: m, total: totalSpend, by_category: byCategory });
});

module.exports = router;
