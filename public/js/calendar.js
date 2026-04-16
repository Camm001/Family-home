let fcInstance = null;

PAGE_RENDERERS.calendar = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <h2>Calendar</h2>
      <button class="btn btn-ghost btn-sm" id="icloud-btn">☁ iCloud</button>
      <button class="btn btn-primary" id="add-event-btn">+ Add Event</button>
    </div>
    <div id="fc-container"></div>
  `;

  document.getElementById('add-event-btn').addEventListener('click', () => openEventModal());
  document.getElementById('icloud-btn').addEventListener('click', openIcloudModal);

  if (fcInstance) { fcInstance.destroy(); fcInstance = null; }

  const users = await App.api('/users').catch(() => []);

  fcInstance = new FullCalendar.Calendar(document.getElementById('fc-container'), {
    initialView: window.innerWidth < 600 ? 'listWeek' : 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
    height: 'auto',
    events: async (info, success, fail) => {
      try {
        const evs = await App.api(`/calendar?start=${info.startStr}&end=${info.endStr}`);
        success(evs.map(e => ({
          id: e.id, title: e.title, start: e.start_datetime, end: e.end_datetime || undefined,
          allDay: !!e.all_day, color: e.color, extendedProps: e
        })));
      } catch { fail(); }
    },
    eventClick: (info) => openEventModal(info.event.extendedProps),
    dateClick: (info) => openEventModal({ start_datetime: info.dateStr, all_day: 1 }),
  });
  fcInstance.render();

  document.addEventListener('ws:event:new', () => fcInstance?.refetchEvents(), { signal: getPageSignal() });
  document.addEventListener('ws:event:update', () => fcInstance?.refetchEvents(), { signal: getPageSignal() });
  document.addEventListener('ws:event:delete', () => fcInstance?.refetchEvents(), { signal: getPageSignal() });
};

function openEventModal(event = {}) {
  const isEdit = !!event.id;
  App.openModal(`
    <h3>${isEdit ? 'Edit' : 'New'} Event</h3>
    <form id="event-form">
      <label>Title</label>
      <input name="title" required value="${escHtml(event.title || '')}">
      <label>Start</label>
      <input name="start" type="datetime-local" required value="${event.start_datetime ? event.start_datetime.slice(0, 16) : ''}">
      <label>End (optional)</label>
      <input name="end" type="datetime-local" value="${event.end_datetime ? event.end_datetime.slice(0, 16) : ''}">
      <div class="form-row">
        <div>
          <label>All Day</label>
          <input type="checkbox" name="all_day" ${event.all_day ? 'checked' : ''}>
        </div>
        <div>
          <label>Color</label>
          <input type="color" name="color" value="${event.color || '#6366f1'}">
        </div>
      </div>
      <label>Description</label>
      <textarea name="description">${escHtml(event.description || '')}</textarea>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="del-event">Delete</button>` : ''}
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, (box) => {
    if (isEdit) {
      box.querySelector('#del-event').addEventListener('click', async () => {
        if (!confirm('Delete this event?')) return;
        await App.api(`/calendar/${event.id}`, { method: 'DELETE' });
        App.closeModal();
        fcInstance?.refetchEvents();
      });
    }
    box.querySelector('#event-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        title: fd.get('title'), start_datetime: fd.get('start'), end_datetime: fd.get('end') || null,
        all_day: fd.get('all_day') === 'on', color: fd.get('color'), description: fd.get('description')
      };
      try {
        if (isEdit) await App.api(`/calendar/${event.id}`, { method: 'PUT', body });
        else await App.api('/calendar', { method: 'POST', body });
        App.closeModal();
        fcInstance?.refetchEvents();
        App.toast(isEdit ? 'Event updated' : 'Event added', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}

async function openIcloudModal() {
  let status = { connected: false };
  try { status = await App.api('/integrations/status'); } catch {}

  App.openModal(`
    <div class="modal-header"><h3>☁ iCloud Calendar</h3></div>
    <div class="modal-body" id="icloud-modal-body">
      ${status.connected ? `
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
          <span class="badge badge-green">Connected</span>
          <span class="text-sm text-muted">${escHtml(status.username)}</span>
        </div>
        <p class="text-sm text-muted">Last synced: ${status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : 'Never'}</p>
        <div style="display:flex;gap:.5rem;margin-top:1rem">
          <button class="btn btn-primary btn-sm" id="icloud-sync-now-btn">Sync Now</button>
          <button class="btn btn-danger btn-sm" id="icloud-disconnect-btn">Disconnect</button>
        </div>
      ` : `
        <p class="text-sm text-muted" style="margin-bottom:1rem">Connect your iCloud calendar to see events here. You'll need an <strong>App-Specific Password</strong> — not your main Apple ID password.</p>
        <label>Apple ID (email)</label>
        <input type="email" id="icloud-username" placeholder="you@icloud.com">
        <label style="margin-top:.75rem">App-Specific Password</label>
        <input type="password" id="icloud-password" placeholder="xxxx-xxxx-xxxx-xxxx">
        <p class="text-xs text-muted" style="margin-top:.375rem">
          Generate one at <a href="https://appleid.apple.com/account/security" target="_blank" rel="noopener">appleid.apple.com</a> → App-Specific Passwords.
        </p>
      `}
    </div>
    <div class="modal-footer">
      ${status.connected ? '' : '<button class="btn btn-primary" id="icloud-connect-btn">Connect</button>'}
      <button class="btn btn-ghost modal-close">Cancel</button>
    </div>
  `);

  if (status.connected) {
    document.getElementById('icloud-sync-now-btn').addEventListener('click', async () => {
      try {
        const res = await App.api('/integrations/icloud/sync', { method: 'POST' });
        App.toast(`Synced ${res.synced} new events`, 'success');
        fcInstance?.refetchEvents();
        App.closeModal();
      } catch (e) { App.toast(e.message, 'error'); }
    });

    document.getElementById('icloud-disconnect-btn').addEventListener('click', async () => {
      if (!confirm('Disconnect iCloud? This will remove imported events.')) return;
      try {
        await App.api('/integrations/icloud', { method: 'DELETE' });
        App.toast('iCloud disconnected', 'success');
        fcInstance?.refetchEvents();
        App.closeModal();
      } catch (e) { App.toast(e.message, 'error'); }
    });
  } else {
    document.getElementById('icloud-connect-btn').addEventListener('click', async () => {
      const username = document.getElementById('icloud-username').value.trim();
      const app_password = document.getElementById('icloud-password').value.trim();
      if (!username || !app_password) { App.toast('Both fields are required', 'error'); return; }

      const btn = document.getElementById('icloud-connect-btn');
      btn.disabled = true;
      btn.textContent = 'Connecting…';

      try {
        await App.api('/integrations/icloud/connect', { method: 'POST', body: { username, app_password } });
        App.toast('iCloud connected! Syncing events…', 'success');
        fcInstance?.refetchEvents();
        App.closeModal();
      } catch (e) {
        App.toast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Connect';
      }
    });
  }
}

// Simple page-scoped abort signal
let _pageController = null;
function getPageSignal() {
  if (_pageController) _pageController.abort();
  _pageController = new AbortController();
  return _pageController.signal;
}
