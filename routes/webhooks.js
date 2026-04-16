const router = require('express').Router();

router.post('/inbound', (req, res) => {
  const secret = req.headers['x-webhook-secret'];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const db = req.app.locals.db;
  const { action } = req.body;

  try {
    switch (action) {
      case 'add_shopping_item': {
        const { list_name, item } = req.body;
        const list = db.prepare('SELECT id FROM lists WHERE LOWER(name) = LOWER(?)').get(list_name);
        if (!list) return res.status(404).json({ error: `List "${list_name}" not found` });
        db.prepare('INSERT INTO list_items (list_id, text) VALUES (?, ?)').run(list.id, item);
        req.app.locals.broadcast('shopping:item_added', { list_id: list.id, item: { text: item } });
        return res.json({ ok: true });
      }

      case 'add_expense': {
        const { amount, description, category } = req.body;
        const cat = category ? db.prepare('SELECT id FROM expense_categories WHERE LOWER(name) = LOWER(?)').get(category) : null;
        const date = new Date().toISOString().split('T')[0];
        // Use first admin user as the expense owner
        const admin = db.prepare('SELECT id FROM users WHERE role = "admin" LIMIT 1').get();
        if (!admin) return res.status(500).json({ error: 'No admin user found' });
        db.prepare('INSERT INTO expenses (user_id, amount, description, category_id, date) VALUES (?, ?, ?, ?, ?)').run(admin.id, amount, description, cat ? cat.id : null, date);
        return res.json({ ok: true });
      }

      case 'create_event': {
        const { title, start, end, all_day } = req.body;
        const admin = db.prepare('SELECT id FROM users WHERE role = "admin" LIMIT 1').get();
        if (!admin) return res.status(500).json({ error: 'No admin user found' });
        db.prepare('INSERT INTO events (title, start_datetime, end_datetime, all_day, user_id) VALUES (?, ?, ?, ?, ?)').run(title, start, end || null, all_day ? 1 : 0, admin.id);
        return res.json({ ok: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
