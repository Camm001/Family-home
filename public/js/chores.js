PAGE_RENDERERS.chores = async function () {
  const [chores, users] = await Promise.all([App.api('/chores'), App.api('/users')]);
  renderChores(chores, users);
};

function renderChores(chores, users) {
  const today = new Date().toISOString().split('T')[0];
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const content = document.getElementById('content');
  const pending = chores.filter(c => !c.completed_at);
  const done = chores.filter(c => c.completed_at);

  content.innerHTML = `
    <div class="section-header">
      <h2>Chores</h2>
      <button class="btn btn-primary" id="add-chore-btn">+ Add Chore</button>
    </div>
    <div id="chores-list">
      ${pending.length === 0 && done.length === 0 ? '<div class="empty-state"><div class="empty-icon">🧹</div><p>No chores yet!</p></div>' : ''}
      ${pending.map(c => renderChore(c, today, soon)).join('')}
      ${done.length ? `<details style="margin-top:1rem"><summary class="text-muted text-sm" style="cursor:pointer">Completed (${done.length})</summary>${done.map(c => renderChore(c, today, soon)).join('')}</details>` : ''}
    </div>
  `;

  document.getElementById('add-chore-btn').addEventListener('click', () => openChoreModal({}, users));

  document.getElementById('chores-list').addEventListener('click', async e => {
    const row = e.target.closest('[data-chore-id]');
    if (!row) return;
    const id = parseInt(row.dataset.choreId);
    if (e.target.classList.contains('chore-complete')) {
      await App.api(`/chores/${id}/complete`, { method: 'POST' });
      App.toast('Chore marked complete!', 'success');
      PAGE_RENDERERS.chores();
    } else if (e.target.classList.contains('chore-edit')) {
      const chore = chores.find(c => c.id === id);
      openChoreModal(chore, users);
    } else if (e.target.classList.contains('chore-delete')) {
      if (!confirm('Delete this chore?')) return;
      await App.api(`/chores/${id}`, { method: 'DELETE' });
      PAGE_RENDERERS.chores();
    }
  });
}

function renderChore(c, today, soon) {
  let badge = '';
  if (!c.completed_at && c.due_date) {
    if (c.due_date < today) badge = `<span class="badge badge-overdue">Overdue</span>`;
    else if (c.due_date <= soon) badge = `<span class="badge badge-due-soon">Due soon</span>`;
    else badge = `<span class="badge badge-ok">On track</span>`;
  }
  return `<div class="chore-item${c.completed_at ? ' completed' : ''}" data-chore-id="${c.id}">
    <div style="flex:1">
      <div class="chore-title">${escHtml(c.title)}</div>
      <div class="chore-meta">
        ${c.assigned_name ? `<span>👤 ${escHtml(c.assigned_name)}</span>` : '<span>Unassigned</span>'}
        ${c.due_date ? `<span>📅 ${c.due_date}</span>` : ''}
        <span>🔄 ${c.frequency}</span>
        ${c.completed_at ? `<span class="text-success">✓ Done by ${escHtml(c.completed_by_name || '?')}</span>` : ''}
        ${badge}
      </div>
    </div>
    <div class="flex gap-2">
      ${!c.completed_at ? `<button class="btn btn-sm btn-primary chore-complete">✓ Done</button>` : ''}
      <button class="btn btn-sm btn-ghost chore-edit">Edit</button>
      <button class="btn btn-sm btn-ghost chore-delete">✕</button>
    </div>
  </div>`;
}

function openChoreModal(chore = {}, users = []) {
  const isEdit = !!chore.id;
  App.openModal(`
    <h3>${isEdit ? 'Edit' : 'New'} Chore</h3>
    <form id="chore-form">
      <label>Title</label>
      <input name="title" required value="${escHtml(chore.title || '')}">
      <label>Assign To</label>
      <select name="assigned_to">
        <option value="">Unassigned</option>
        ${users.map(u => `<option value="${u.id}" ${chore.assigned_to === u.id ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('')}
      </select>
      <div class="form-row">
        <div>
          <label>Due Date</label>
          <input type="date" name="due_date" value="${chore.due_date || ''}">
        </div>
        <div>
          <label>Frequency</label>
          <select name="frequency">
            ${['once','daily','weekly','biweekly','monthly'].map(f => `<option value="${f}" ${chore.frequency === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#chore-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { title: fd.get('title'), assigned_to: fd.get('assigned_to') || null, frequency: fd.get('frequency'), due_date: fd.get('due_date') || null };
      try {
        if (isEdit) await App.api(`/chores/${chore.id}`, { method: 'PUT', body });
        else await App.api('/chores', { method: 'POST', body });
        App.closeModal();
        PAGE_RENDERERS.chores();
        App.toast(isEdit ? 'Chore updated' : 'Chore added', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
