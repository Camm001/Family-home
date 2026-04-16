const REMINDER_TYPES = ['birthday', 'anniversary', 'bill', 'registration', 'subscription', 'custom'];
const REMINDER_ICONS = { birthday: '🎂', anniversary: '💍', bill: '💳', registration: '📋', subscription: '🔔', custom: '📅' };

PAGE_RENDERERS.reminders = async function () {
  const reminders = await App.api('/reminders');
  renderReminders(reminders);
};

function renderReminders(reminders) {
  const today = new Date().toISOString().split('T')[0];
  const content = document.getElementById('content');

  // Sort by next occurrence (handling yearly recurrence)
  const sorted = [...reminders].sort((a, b) => {
    const nextA = getNextDate(a, today);
    const nextB = getNextDate(b, today);
    return nextA.localeCompare(nextB);
  });

  content.innerHTML = `
    <div class="section-header">
      <h2>Reminders</h2>
      <button class="btn btn-primary" id="add-reminder-btn">+ Add</button>
    </div>
    ${sorted.length === 0 ? '<div class="empty-state"><div class="empty-icon">🔔</div><p>No reminders set.</p></div>' : ''}
    <div id="reminders-list">
      ${sorted.map(r => {
        const next = getNextDate(r, today);
        const daysUntil = Math.ceil((new Date(next) - new Date(today)) / 86400000);
        let urgency = '';
        if (daysUntil <= 0) urgency = '<span class="badge badge-overdue">Today!</span>';
        else if (daysUntil <= 7) urgency = `<span class="badge badge-due-soon">In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}</span>`;
        return `<div class="reminder-item" data-reminder-id="${r.id}">
          <span class="reminder-icon">${REMINDER_ICONS[r.reminder_type] || '📅'}</span>
          <div class="reminder-info">
            <div class="reminder-title">${escHtml(r.title)}</div>
            <div class="reminder-meta">${next} · ${r.reminder_type}${r.recur_yearly ? ' · Yearly' : ''} · ${r.days_before} days before ${urgency}</div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-ghost reminder-edit">Edit</button>
            <button class="btn btn-sm btn-ghost reminder-delete">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;

  document.getElementById('add-reminder-btn').addEventListener('click', () => openReminderModal());

  document.getElementById('reminders-list').addEventListener('click', async e => {
    const row = e.target.closest('[data-reminder-id]');
    if (!row) return;
    const id = parseInt(row.dataset.reminderId);
    if (e.target.classList.contains('reminder-delete')) {
      if (!confirm('Delete reminder?')) return;
      await App.api(`/reminders/${id}`, { method: 'DELETE' });
      PAGE_RENDERERS.reminders();
    } else if (e.target.classList.contains('reminder-edit')) {
      const r = reminders.find(r => r.id === id);
      openReminderModal(r);
    }
  });
}

function getNextDate(r, today) {
  if (!r.recur_yearly) return r.date;
  const d = new Date(r.date);
  const now = new Date(today);
  d.setFullYear(now.getFullYear());
  if (d < now) d.setFullYear(now.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

function openReminderModal(r = {}) {
  const isEdit = !!r.id;
  App.openModal(`
    <h3>${isEdit ? 'Edit' : 'New'} Reminder</h3>
    <form id="reminder-form">
      <label>Title</label>
      <input name="title" required value="${escHtml(r.title || '')}">
      <div class="form-row">
        <div>
          <label>Type</label>
          <select name="reminder_type">
            ${REMINDER_TYPES.map(t => `<option value="${t}" ${r.reminder_type === t ? 'selected' : ''}>${REMINDER_ICONS[t]} ${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Date</label>
          <input type="date" name="date" required value="${r.date || ''}">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Days before to notify</label>
          <input type="number" name="days_before" min="0" value="${r.days_before || 7}">
        </div>
        <div>
          <label>Repeat yearly</label>
          <input type="checkbox" name="recur_yearly" ${r.recur_yearly ? 'checked' : ''}>
        </div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#reminder-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { title: fd.get('title'), reminder_type: fd.get('reminder_type'), date: fd.get('date'), recur_yearly: fd.get('recur_yearly') === 'on', days_before: parseInt(fd.get('days_before')) };
      try {
        if (isEdit) await App.api(`/reminders/${r.id}`, { method: 'PUT', body });
        else await App.api('/reminders', { method: 'POST', body });
        App.closeModal(); PAGE_RENDERERS.reminders();
        App.toast(isEdit ? 'Reminder updated' : 'Reminder added', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
