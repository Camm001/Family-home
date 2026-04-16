PAGE_RENDERERS.links = async function () {
  const links = await App.api('/links');
  renderLinks(links);
};

function renderLinks(links) {
  const content = document.getElementById('content');

  const categories = [...new Set(links.map(l => l.category).filter(Boolean))];
  const grouped = {};
  links.forEach(l => {
    const key = l.category || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(l);
  });

  content.innerHTML = `
    <div class="section-header">
      <h2>Links</h2>
      <button class="btn btn-primary" id="add-link-btn">+ Add Link</button>
    </div>
    ${links.length === 0 ? '<div class="empty-state"><div class="empty-icon">🔗</div><p>No links saved yet.</p></div>' : ''}
    ${Object.entries(grouped).map(([cat, items]) => `
      <div style="margin-bottom:1.5rem">
        <h3 class="text-sm text-muted" style="margin-bottom:.5rem">${cat.toUpperCase()}</h3>
        <div class="grid-2">
          ${items.map(l => `
            <div class="link-card" data-link-id="${l.id}">
              ${l.favicon_url ? `<img class="link-favicon" src="${escHtml(l.favicon_url)}" alt="" onerror="this.remove()">` : '<span style="font-size:1.2rem">🔗</span>'}
              <div class="link-info">
                <a class="link-title" href="${escHtml(l.url)}" target="_blank" rel="noopener">${escHtml(l.title)}</a>
                <div class="link-url truncate">${escHtml(l.url)}</div>
                ${l.description ? `<div class="link-desc">${escHtml(l.description)}</div>` : ''}
                <div class="text-xs text-muted" style="margin-top:.25rem">${escHtml(l.user_name)}</div>
              </div>
              ${l.user_id === App.user.id || App.user.role === 'admin' ? `
                <button class="btn btn-sm btn-ghost link-delete" data-id="${l.id}">✕</button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;

  document.getElementById('add-link-btn').addEventListener('click', openLinkModal);

  content.addEventListener('click', async e => {
    if (e.target.classList.contains('link-delete')) {
      const id = e.target.dataset.id;
      if (!confirm('Delete this link?')) return;
      await App.api(`/links/${id}`, { method: 'DELETE' });
      PAGE_RENDERERS.links();
    }
  });
}

function openLinkModal() {
  App.openModal(`
    <h3>Add Link</h3>
    <form id="link-form">
      <label>URL</label>
      <input name="url" type="url" required placeholder="https://...">
      <label>Title</label>
      <input name="title" required>
      <label>Description (optional)</label>
      <input name="description">
      <label>Category (optional)</label>
      <input name="category" placeholder="e.g. Tools, School, Work">
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    // Auto-fill title from URL
    box.querySelector('[name="url"]').addEventListener('blur', e => {
      const titleInput = box.querySelector('[name="title"]');
      if (!titleInput.value && e.target.value) {
        try {
          const u = new URL(e.target.value);
          titleInput.value = u.hostname.replace('www.', '');
        } catch {}
      }
    });

    box.querySelector('#link-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { url: fd.get('url'), title: fd.get('title'), description: fd.get('description') || null, category: fd.get('category') || null };
      try {
        await App.api('/links', { method: 'POST', body });
        App.closeModal(); PAGE_RENDERERS.links();
        App.toast('Link saved', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
