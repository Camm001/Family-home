const router = require('express').Router();
const auth = require('../middleware/auth');

// GET /api/integrations/status
router.get('/status', auth, (req, res) => {
  const db = req.app.locals.db;
  const row = db.prepare('SELECT username, calendar_url, last_sync_at FROM user_integrations WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ connected: false });
  res.json({ connected: true, username: row.username, calendar_url: row.calendar_url, last_sync_at: row.last_sync_at });
});

// POST /api/integrations/icloud/connect
router.post('/icloud/connect', auth, async (req, res) => {
  const { username, app_password } = req.body;
  if (!username || !app_password) return res.status(400).json({ error: 'username and app_password required' });

  try {
    const { createDAVClient } = require('tsdav');
    const client = await createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username, password: app_password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();
    const primary = calendars.find(c => c.displayName) || calendars[0];
    const calendarUrl = primary ? primary.url : null;

    const db = req.app.locals.db;
    db.prepare(`
      INSERT INTO user_integrations (user_id, provider, username, app_password, calendar_url)
      VALUES (?, 'icloud', ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        app_password = excluded.app_password,
        calendar_url = excluded.calendar_url
    `).run(req.user.id, username, app_password, calendarUrl);

    // Kick off first sync in background
    const { syncUser } = require('../services/icloud-sync');
    syncUser(req.user.id, db).catch(() => {});

    res.json({ connected: true, username, calendar_url: calendarUrl });
  } catch (e) {
    res.status(400).json({ error: `Could not connect to iCloud: ${e.message}` });
  }
});

// DELETE /api/integrations/icloud
router.delete('/icloud', auth, (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM user_integrations WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// POST /api/integrations/icloud/sync
router.post('/icloud/sync', auth, async (req, res) => {
  const db = req.app.locals.db;
  const integration = db.prepare('SELECT id FROM user_integrations WHERE user_id = ?').get(req.user.id);
  if (!integration) return res.status(404).json({ error: 'No iCloud integration found' });

  try {
    const { syncUser } = require('../services/icloud-sync');
    const count = await syncUser(req.user.id, db);
    res.json({ ok: true, synced: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
