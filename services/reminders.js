const cron = require('node-cron');

// Daily check at 7am
cron.schedule('0 7 * * *', () => {
  // db is available after server starts; use a lazy require pattern
  try {
    const db = require('better-sqlite3')(require('path').join(__dirname, '..', 'family-hub.db'));
    checkReminders(db);
    db.close();
  } catch (e) {
    console.error('[Reminders] Error:', e.message);
  }
});

function checkReminders(db) {
  const today = new Date().toISOString().split('T')[0];
  const reminders = db.prepare('SELECT * FROM reminders WHERE notified_at IS NULL OR date(notified_at) < ?').all(today);

  for (const r of reminders) {
    const targetDate = new Date(r.date);
    const now = new Date();

    // For yearly recurring, find the next occurrence
    if (r.recur_yearly) {
      targetDate.setFullYear(now.getFullYear());
      if (targetDate < now) targetDate.setFullYear(now.getFullYear() + 1);
    }

    const daysUntil = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil === r.days_before || daysUntil === 1 || daysUntil === 0) {
      const msg = daysUntil === 0
        ? `Today: ${r.title}`
        : `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}: ${r.title}`;

      console.log(`[Reminders] ${msg}`);
      db.prepare('UPDATE reminders SET notified_at = datetime("now") WHERE id = ?').run(r.id);

      // Fire push notification
      try {
        const pushSvc = require('./push');
        const fullDb = require('better-sqlite3')(require('path').join(__dirname, '..', 'family-hub.db'));
        pushSvc.sendToUser(fullDb, r.user_id, { title: '📅 Reminder', body: msg }).finally(() => fullDb.close());
      } catch {}
    }
  }
}

module.exports = { checkReminders };
