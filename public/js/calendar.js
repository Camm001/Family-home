let fcInstance = null;

PAGE_RENDERERS.calendar = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <h2>Calendar</h2>
      <button class="btn btn-primary" id="add-event-btn">+ Add Event</button>
    </div>
    <div id="fc-container"></div>
  `;

  document.getElementById('add-event-btn').addEventListener('click', () => openEventModal());

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

// Simple page-scoped abort signal
let _pageController = null;
function getPageSignal() {
  if (_pageController) _pageController.abort();
  _pageController = new AbortController();
  return _pageController.signal;
}
