const cron = require('node-cron');

async function syncUser(userId, db) {
  const integration = db.prepare('SELECT * FROM user_integrations WHERE user_id = ?').get(userId);
  if (!integration) return 0;

  const { createDAVClient } = require('tsdav');
  const ICAL = require('ical.js');

  const client = await createDAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: integration.username, password: integration.app_password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  const calendars = await client.fetchCalendars();
  const calendar = calendars.find(c => c.url === integration.calendar_url) || calendars[0];
  if (!calendar) return 0;

  const objects = await client.fetchCalendarObjects({ calendar });
  let count = 0;

  for (const obj of objects) {
    if (!obj.data) continue;
    try {
      const jcal = ICAL.parse(obj.data);
      const comp = new ICAL.Component(jcal);
      const vevents = comp.getAllSubcomponents('vevent');

      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent);
        const uid = event.uid;
        if (!uid) continue;

        const title = event.summary || '(No title)';
        const dtstart = event.startDate;
        const dtend = event.endDate;
        const allDay = dtstart.isDate ? 1 : 0;
        const start = dtstart.toJSDate().toISOString();
        const end = dtend ? dtend.toJSDate().toISOString() : null;
        const description = event.description || null;

        const existing = db.prepare('SELECT id FROM events WHERE ical_uid = ?').get(uid);
        if (existing) {
          db.prepare(`
            UPDATE events SET title=?, start_datetime=?, end_datetime=?, all_day=?, description=?
            WHERE ical_uid=?
          `).run(title, start, end, allDay, description, uid);
        } else {
          db.prepare(`
            INSERT INTO events (title, start_datetime, end_datetime, all_day, description, user_id, ical_uid, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'icloud')
          `).run(title, start, end, allDay, description, userId, uid);
          count++;
        }
      }
    } catch { /* skip malformed events */ }
  }

  // Remove events that no longer exist in iCloud
  const remoteUids = new Set();
  for (const obj of objects) {
    if (!obj.data) continue;
    try {
      const jcal = ICAL.parse(obj.data);
      const comp = new ICAL.Component(jcal);
      comp.getAllSubcomponents('vevent').forEach(v => {
        const uid = new ICAL.Event(v).uid;
        if (uid) remoteUids.add(uid);
      });
    } catch { /* skip */ }
  }

  const localIcloudEvents = db.prepare('SELECT id, ical_uid FROM events WHERE user_id = ? AND source = ?').all(userId, 'icloud');
  for (const ev of localIcloudEvents) {
    if (!remoteUids.has(ev.ical_uid)) {
      db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
    }
  }

  db.prepare('UPDATE user_integrations SET last_sync_at = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
  return count;
}

// Run every 15 minutes for all connected users
cron.schedule('*/15 * * * *', async () => {
  // Lazy-load db from the app — attach db when service is first required
  const db = module.exports._db;
  if (!db) return;

  const integrations = db.prepare('SELECT user_id FROM user_integrations').all();
  for (const row of integrations) {
    try { await syncUser(row.user_id, db); } catch { /* log silently */ }
  }
});

module.exports = { syncUser };
module.exports._db = null; // set by server.js after db is ready
