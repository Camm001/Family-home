PAGE_RENDERERS.dashboard = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `<div class="ai-loading">Loading dashboard...</div>`;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const [events, chores, lists, posts, reminders] = await Promise.all([
      App.api(`/calendar?start=${todayStr}&end=${nextWeek}`),
      App.api('/chores'),
      App.api('/shopping/lists'),
      App.api('/board'),
      App.api('/reminders'),
    ]);

    const overdueChores = chores.filter(c => !c.completed_at && c.due_date && c.due_date < todayStr);
    const dueChores = chores.filter(c => !c.completed_at && c.due_date && c.due_date >= todayStr && c.due_date <= nextWeek);
    const upcomingEvents = events.slice(0, 5);
    const totalPending = lists.reduce((s, l) => s + (l.pending_count || 0), 0);
    const upcomingReminders = reminders.filter(r => r.date >= todayStr && r.date <= nextWeek);
    const pinnedPosts = posts.filter(p => p.pinned).slice(0, 3);

    content.innerHTML = `
      <div class="section-header">
        <h2>Good ${getGreeting()}, ${App.user.name.split(' ')[0]}!</h2>
        <span class="text-muted text-sm">${formatDate(today)}</span>
      </div>

      <div class="dash-grid">
        <!-- Upcoming Events -->
        <div class="dash-stat card">
          <div class="card-header">
            <span class="card-title">📅 Upcoming Events</span>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('calendar')">View all</button>
          </div>
          ${upcomingEvents.length ? `<ul class="dash-item-list">
            ${upcomingEvents.map(e => `<li class="dash-item"><span class="dot" style="background:${e.color || e.user_color}"></span><div><div class="text-sm bold">${escHtml(e.title)}</div><div class="text-xs text-muted">${formatDateShort(e.start_datetime)}</div></div></li>`).join('')}
          </ul>` : '<p class="text-muted text-sm mt-4">No events this week</p>'}
        </div>

        <!-- Chores -->
        <div class="dash-stat card">
          <div class="card-header">
            <span class="card-title">🧹 Chores</span>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('chores')">View all</button>
          </div>
          ${overdueChores.length ? `<div class="badge badge-overdue mb-2">${overdueChores.length} overdue</div>` : ''}
          ${dueChores.length ? `<ul class="dash-item-list">
            ${dueChores.slice(0, 4).map(c => `<li class="dash-item"><span class="dot"></span><div><div class="text-sm bold">${escHtml(c.title)}</div><div class="text-xs text-muted">${c.assigned_name ? `→ ${c.assigned_name}` : 'Unassigned'} · ${c.due_date}</div></div></li>`).join('')}
          </ul>` : '<p class="text-muted text-sm mt-4">No chores due this week</p>'}
        </div>

        <!-- Shopping -->
        <div class="dash-stat card">
          <div class="card-header">
            <span class="card-title">🛒 Shopping</span>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('shopping')">View all</button>
          </div>
          <div class="dash-stat-value">${totalPending}</div>
          <div class="dash-stat-label">items pending across ${lists.length} list${lists.length !== 1 ? 's' : ''}</div>
          <ul class="dash-item-list mt-4">
            ${lists.slice(0, 4).map(l => `<li class="dash-item"><span class="dot"></span><div class="text-sm">${escHtml(l.name)} <span class="text-muted">(${l.pending_count || 0} left)</span></div></li>`).join('')}
          </ul>
        </div>

        <!-- Reminders -->
        <div class="dash-stat card">
          <div class="card-header">
            <span class="card-title">🔔 Reminders</span>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('reminders')">View all</button>
          </div>
          ${upcomingReminders.length ? `<ul class="dash-item-list">
            ${upcomingReminders.slice(0, 4).map(r => `<li class="dash-item"><span class="dot" style="background:var(--warning)"></span><div><div class="text-sm bold">${escHtml(r.title)}</div><div class="text-xs text-muted">${r.date} · ${r.reminder_type}</div></div></li>`).join('')}
          </ul>` : '<p class="text-muted text-sm mt-4">No reminders this week</p>'}
        </div>

        <!-- Pinned Posts -->
        ${pinnedPosts.length ? `<div class="dash-stat card" style="grid-column: span 2">
          <div class="card-header">
            <span class="card-title">📌 Pinned Posts</span>
            <button class="btn btn-sm btn-ghost" onclick="App.navigate('board')">View all</button>
          </div>
          ${pinnedPosts.map(p => `<div class="mb-3"><div class="bold text-sm">${escHtml(p.title)}</div><div class="text-xs text-muted mt-4" style="margin-top:.25rem;">${escHtml(p.body.slice(0, 120))}${p.body.length > 120 ? '…' : ''}</div></div>`).join('<hr style="border-color:var(--border);margin:.5rem 0">')}
        </div>` : ''}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><p class="text-danger">${e.message}</p></div>`;
  }
};

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(str) {
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
window.escHtml = escHtml;
window.formatDateShort = formatDateShort;
