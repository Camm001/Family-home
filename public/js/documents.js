const DOC_CATEGORIES = {
  wifi: '📶', insurance: '🏥', medical: '💊', vehicle: '🚗',
  appliances: '🔧', emergency: '🚨', financial: '💰', other: '📄'
};

PAGE_RENDERERS.documents = async function () {
  const docs = await App.api('/documents');
  renderDocuments(docs);
};

function renderDocuments(docs) {
  const content = document.getElementById('content');
  const grouped = {};
  docs.forEach(d => { if (!grouped[d.category]) grouped[d.category] = []; grouped[d.category].push(d); });

  content.innerHTML = `
    <div class="section-header">
      <h2>Document Vault</h2>
      <button class="btn btn-primary" id="upload-doc-btn">+ Upload</button>
    </div>
    ${docs.length === 0 ? '<div class="empty-state"><div class="empty-icon">📂</div><p>No documents yet.</p></div>' : ''}
    ${Object.entries(grouped).map(([cat, items]) => `
      <div style="margin-bottom:1.5rem">
        <h3 style="font-size:.9rem;color:var(--text2);margin-bottom:.5rem">${DOC_CATEGORIES[cat] || '📄'} ${cat.toUpperCase()}</h3>
        <div class="doc-list">
          ${items.map(d => `
            <div class="doc-item" data-doc-id="${d.id}">
              <span class="doc-icon">${DOC_CATEGORIES[d.category] || '📄'}</span>
              <div class="doc-info">
                <div class="doc-title">${escHtml(d.title)}</div>
                ${d.summary ? `<div class="doc-summary">${escHtml(d.summary)}</div>` : ''}
                <div class="doc-category text-muted">${escHtml(d.user_name)} · ${d.created_at?.split('T')[0] || ''} ${d.visible_to === 'adults' ? '🔒 Adults only' : ''}</div>
              </div>
              <div class="flex gap-2">
                <a href="/data/documents/${d.filename}" target="_blank" download="${escHtml(d.original_name)}" class="btn btn-sm btn-secondary">⬇ Download</a>
                ${!d.summary ? `<button class="btn btn-sm btn-ghost ai-summarize" data-id="${d.id}">✨ Summarize</button>` : ''}
                <button class="btn btn-sm btn-ghost doc-delete" data-id="${d.id}">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;

  document.getElementById('upload-doc-btn').addEventListener('click', openDocUploadModal);

  content.addEventListener('click', async e => {
    if (e.target.classList.contains('doc-delete')) {
      const id = e.target.dataset.id;
      if (!confirm('Delete this document?')) return;
      await App.api(`/documents/${id}`, { method: 'DELETE' });
      PAGE_RENDERERS.documents();
    }
    if (e.target.classList.contains('ai-summarize')) {
      const id = e.target.dataset.id;
      e.target.textContent = '⏳';
      e.target.disabled = true;
      try {
        const { summary } = await App.api('/ai/summarize-doc', { method: 'POST', body: { document_id: parseInt(id) } });
        const docItem = document.querySelector(`[data-doc-id="${id}"] .doc-info`);
        if (docItem) docItem.insertAdjacentHTML('beforeend', `<div class="doc-summary">${escHtml(summary)}</div>`);
        e.target.closest('.flex').removeChild(e.target);
        App.toast('Document summarized!', 'success');
      } catch (err) { App.toast(err.message, 'error'); e.target.textContent = '✨ Summarize'; e.target.disabled = false; }
    }
  });
}

function openDocUploadModal() {
  App.openModal(`
    <h3>Upload Document</h3>
    <form id="doc-form" enctype="multipart/form-data">
      <label>Title</label>
      <input name="title" required>
      <label>Category</label>
      <select name="category">
        ${Object.entries(DOC_CATEGORIES).map(([k, v]) => `<option value="${k}">${v} ${k}</option>`).join('')}
      </select>
      <label>Visible to</label>
      <select name="visible_to">
        <option value="all">Everyone</option>
        <option value="adults">Adults only</option>
      </select>
      <label>File (PDF, JPG, PNG)</label>
      <div class="upload-area" id="doc-upload-area">
        <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required id="doc-file-input">
        <p>Click or drag file here</p>
        <p class="text-xs text-muted">PDF, JPG, PNG · Max 20MB</p>
        <p id="doc-file-name" class="text-sm text-muted" style="margin-top:.5rem"></p>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Upload</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    const area = box.querySelector('#doc-upload-area');
    const input = box.querySelector('#doc-file-input');
    area.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) box.querySelector('#doc-file-name').textContent = input.files[0].name; });

    box.querySelector('#doc-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await App.apiForm('/documents', fd);
        App.closeModal(); PAGE_RENDERERS.documents();
        App.toast('Document uploaded', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
