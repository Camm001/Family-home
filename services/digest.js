const cron = require('node-cron');
const nodemailer = require('nodemailer');

// Sunday at 8am
cron.schedule('0 8 * * 0', async () => {
  try {
    const db = new (require('better-sqlite3'))(require('path').join(__dirname, '..', 'family-hub.db'));
    await sendDigest(db);
    db.close();
  } catch (e) { console.error('[Digest] Error:', e.message); }
});

async function sendDigest(db) {
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().split('T')[0];
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const events = db.prepare('SELECT e.title, e.start_datetime, u.name as user_name FROM events e JOIN users u ON e.user_id = u.id WHERE date(e.start_datetime) BETWEEN ? AND ? ORDER BY e.start_datetime').all(todayStr, nextWeekStr);
  const chores = db.prepare('SELECT c.title, c.due_date, u.name as assigned_name FROM chores c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.completed_at IS NULL AND c.due_date BETWEEN ? AND ? ORDER BY c.due_date').all(todayStr, nextWeekStr);
  const mealPlan = db.prepare('SELECT mp.date, mp.meal_type, COALESCE(r.title, mp.custom_meal) as meal FROM meal_plan mp LEFT JOIN recipes r ON mp.recipe_id = r.id WHERE mp.date BETWEEN ? AND ? ORDER BY mp.date, mp.meal_type').all(todayStr, nextWeekStr);
  const reminders = db.prepare('SELECT title, date, reminder_type FROM reminders WHERE date BETWEEN ? AND ? ORDER BY date').all(todayStr, nextWeekStr);
  const pinnedPosts = db.prepare('SELECT p.title, p.body, u.name as user_name FROM posts p JOIN users u ON p.user_id = u.id WHERE p.pinned = 1 ORDER BY p.created_at DESC LIMIT 5').all();
  const month = today.toISOString().slice(0, 7);
  const expenseSummary = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ?").get(month);
  const lowPantry = db.prepare('SELECT name, current_stock, threshold, unit FROM pantry_items WHERE current_stock <= threshold ORDER BY name').all();

  const lines = [
    `Family Hub — Weekly Digest (${todayStr})`,
    '='.repeat(50),
    '',
    '📅 WEEK AHEAD',
    events.length ? events.map(e => `  • ${e.start_datetime.slice(0, 10)} — ${e.title} (${e.user_name})`).join('\n') : '  No events this week.',
    '',
    '🧹 CHORES DUE',
    chores.length ? chores.map(c => `  • ${c.due_date} — ${c.title}${c.assigned_name ? ` → ${c.assigned_name}` : ''}`).join('\n') : '  No chores due this week.',
    '',
    '🍽️ MEAL PLAN',
    mealPlan.length ? mealPlan.map(m => `  • ${m.date} ${m.meal_type}: ${m.meal}`).join('\n') : '  No meal plan set.',
    '',
    '🔔 REMINDERS',
    reminders.length ? reminders.map(r => `  • ${r.date} — ${r.title} (${r.reminder_type})`).join('\n') : '  No upcoming reminders.',
    '',
    '📌 PINNED POSTS',
    pinnedPosts.length ? pinnedPosts.map(p => `  • ${p.title} — ${p.user_name}`).join('\n') : '  No pinned posts.',
    '',
    '💰 EXPENSES (this month)',
    `  Total: $${expenseSummary.total.toFixed(2)}`,
    '',
    '🥫 PANTRY RUNNING LOW',
    lowPantry.length ? lowPantry.map(p => `  • ${p.name}: ${p.current_stock}/${p.threshold} ${p.unit}`).join('\n') : '  All stocked up!',
  ].join('\n');

  if (!process.env.SMTP_HOST) {
    console.log('[Digest] SMTP not configured — digest:\n' + lines);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  try {
    await transporter.sendMail({
      from: process.env.DIGEST_FROM || 'familyhub@localhost',
      to: process.env.DIGEST_TO,
      subject: `Family Hub Weekly Digest — ${todayStr}`,
      text: lines
    });
    console.log('[Digest] Sent successfully');
  } catch (e) {
    console.error('[Digest] Send failed:', e.message);
  }
}

module.exports = { sendDigest };
