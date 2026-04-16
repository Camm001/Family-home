const router = require('express').Router();
const auth = require('../middleware/auth');

router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', auth, (req, res) => {
  const db = req.app.locals.db;
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: 'endpoint and keys required' });
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth')
    .run(req.user.id, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

router.delete('/unsubscribe', auth, (req, res) => {
  const db = req.app.locals.db;
  const { endpoint } = req.body;
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  res.json({ ok: true });
});

module.exports = router;
