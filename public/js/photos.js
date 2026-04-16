PAGE_RENDERERS.photos = async function () {
  const [albums, photos] = await Promise.all([App.api('/photos/albums'), App.api('/photos')]);
  renderPhotosPage(albums, photos);
};

function renderPhotosPage(albums, photos) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <h2>Photos</h2>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" id="new-album-btn">+ Album</button>
        <button class="btn btn-primary" id="upload-btn">+ Upload</button>
      </div>
    </div>

    ${albums.length ? `
      <div class="section-header" style="margin-top:0"><h3 class="text-muted text-sm">ALBUMS</h3></div>
      <div class="grid-3" style="margin-bottom:1.5rem">
        ${albums.map(a => `
          <div class="card" style="cursor:pointer" data-album-id="${a.id}">
            <div class="card-title">${escHtml(a.name)}</div>
            <div class="text-sm text-muted mt-4">${a.photo_count} photo${a.photo_count !== 1 ? 's' : ''}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="section-header"><h3 class="text-muted text-sm">ALL PHOTOS</h3></div>
    ${photos.length ? `
      <div class="photo-grid" id="photo-grid">
        ${photos.map((p, i) => `
          <div class="photo-thumb" data-idx="${i}" data-photo-id="${p.id}">
            <img src="/data/photos/${p.filename}" alt="${escHtml(p.caption || p.original_name)}" loading="lazy">
            <div class="photo-overlay">
              <span class="photo-caption">${escHtml(p.caption || p.user_name)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty-state"><div class="empty-icon">📸</div><p>No photos yet.</p></div>'}
  `;

  document.getElementById('upload-btn').addEventListener('click', () => openUploadModal(albums));
  document.getElementById('new-album-btn').addEventListener('click', () => openNewAlbumModal());

  document.getElementById('photo-grid')?.addEventListener('click', e => {
    const thumb = e.target.closest('[data-idx]');
    if (!thumb) return;
    openLightbox(photos, parseInt(thumb.dataset.idx));
  });

  document.querySelectorAll('[data-album-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const albumPhotos = await App.api(`/photos?album_id=${el.dataset.albumId}`);
      openLightbox(albumPhotos, 0);
    });
  });
}

function openLightbox(photos, startIdx) {
  if (photos.length === 0) return;
  let idx = startIdx;
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  document.body.appendChild(lb);

  function render() {
    const p = photos[idx];
    lb.innerHTML = `
      <button class="lightbox-close">✕</button>
      ${idx > 0 ? `<button class="lightbox-close" style="left:1rem;right:auto;font-size:1.5rem">‹</button>` : ''}
      <img src="/data/photos/${p.filename}" alt="${escHtml(p.caption || '')}">
      ${idx < photos.length - 1 ? `<button class="lightbox-close" style="right:1rem;font-size:1.5rem">›</button>` : ''}
    `;
    lb.querySelectorAll('button')[0].addEventListener('click', () => lb.remove());
    const btns = lb.querySelectorAll('button');
    if (idx > 0) btns[btns.length - (idx < photos.length - 1 ? 2 : 1)].addEventListener('click', () => { idx--; render(); });
    if (idx < photos.length - 1) btns[btns.length - 1].addEventListener('click', () => { idx++; render(); });
  }

  lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); }
    if (e.key === 'ArrowLeft' && idx > 0) { idx--; render(); }
    if (e.key === 'ArrowRight' && idx < photos.length - 1) { idx++; render(); }
  });
  render();
}

function openUploadModal(albums) {
  App.openModal(`
    <h3>Upload Photos</h3>
    <form id="upload-form" enctype="multipart/form-data">
      <label>Album (optional)</label>
      <select name="album_id">
        <option value="">No album</option>
        ${albums.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('')}
      </select>
      <label>Caption</label>
      <input name="caption" placeholder="Optional caption">
      <label>Photo</label>
      <div class="upload-area" id="upload-area">
        <input type="file" name="photo" accept="image/*" required id="photo-input">
        <p>Click or drag a photo here</p>
        <p class="text-xs text-muted">Max 20MB · JPG, PNG, GIF, WebP</p>
        <p id="file-name" class="text-sm text-muted" style="margin-top:.5rem"></p>
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Upload</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    const area = box.querySelector('#upload-area');
    const input = box.querySelector('#photo-input');
    area.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) box.querySelector('#file-name').textContent = input.files[0].name; });

    ['dragover','dragenter'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.add('drag-over'); }));
    ['dragleave','drop'].forEach(ev => area.addEventListener(ev, () => area.classList.remove('drag-over')));
    area.addEventListener('drop', e => { e.preventDefault(); input.files = e.dataTransfer.files; if (input.files[0]) box.querySelector('#file-name').textContent = input.files[0].name; });

    box.querySelector('#upload-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await App.apiForm('/photos', fd);
        App.closeModal(); PAGE_RENDERERS.photos();
        App.toast('Photo uploaded!', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}

function openNewAlbumModal() {
  App.openModal(`
    <h3>New Album</h3>
    <form id="album-form">
      <label>Album Name</label>
      <input name="name" required>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Create</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#album-form').addEventListener('submit', async e => {
      e.preventDefault();
      await App.api('/photos/albums', { method: 'POST', body: { name: new FormData(e.target).get('name') } });
      App.closeModal(); PAGE_RENDERERS.photos();
    });
  });
}
