PAGE_RENDERERS.watchlist = async function () {
  const items = await App.api('/watchlist');
  renderWatchlist(items);
};

function renderWatchlist(items) {
  const content = document.getElementById('content');
  const unwatched = items.filter(i => !i.watched);
  const watched = items.filter(i => i.watched);

  content.innerHTML = `
    <div class="section-header">
      <h2>Watchlist</h2>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm filter-btn active" data-filter="all">All</button>
        <button class="btn btn-secondary btn-sm filter-btn" data-filter="movie">Movies</button>
        <button class="btn btn-secondary btn-sm filter-btn" data-filter="show">Shows</button>
        <button class="btn btn-primary" id="add-watch-btn">+ Add</button>
      </div>
    </div>

    <h3 class="text-muted text-sm" style="margin-bottom:.75rem">TO WATCH (${unwatched.length})</h3>
    <div class="watch-grid" id="unwatched-grid">
      ${unwatched.map(renderWatchCard).join('')}
      ${unwatched.length === 0 ? '<p class="text-muted text-sm">Nothing in the queue!</p>' : ''}
    </div>

    ${watched.length ? `
      <details style="margin-top:1.5rem">
        <summary class="text-muted text-sm" style="cursor:pointer">WATCHED (${watched.length})</summary>
        <div class="watch-grid" style="margin-top:.75rem">
          ${watched.map(renderWatchCard).join('')}
        </div>
      </details>
    ` : ''}
  `;

  document.getElementById('add-watch-btn').addEventListener('click', () => openWatchModal());

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      const filter = btn.dataset.filter;
      const url = filter === 'all' ? '/watchlist' : `/watchlist?type=${filter}&watched=false`;
      const filtered = await App.api(url);
      renderWatchlist(filtered);
    });
  });

  document.querySelectorAll('[data-watch-id]').forEach(card => {
    card.addEventListener('click', e => {
      const item = items.find(i => i.id === parseInt(card.dataset.watchId));
      openWatchDetail(item);
    });
  });
}

function renderWatchCard(item) {
  return `<div class="watch-card${item.watched ? ' watched' : ''}" data-watch-id="${item.id}">
    <div class="watch-poster">
      ${item.poster_url ? `<img src="${escHtml(item.poster_url)}" alt="${escHtml(item.title)}" onerror="this.parentElement.textContent='🎬'">` : '🎬'}
    </div>
    <div class="watch-info">
      <div class="watch-title">${escHtml(item.title)}</div>
      <div class="watch-meta">${item.type} ${item.year ? '· ' + item.year : ''}</div>
      ${item.watched ? '<div class="text-xs text-success">✓ Watched</div>' : ''}
    </div>
  </div>`;
}

function openWatchDetail(item) {
  App.openModal(`
    <h3>${escHtml(item.title)}</h3>
    <p class="text-sm text-muted">${item.type}${item.year ? ' · ' + item.year : ''} · Added by ${escHtml(item.added_by_name)}</p>
    ${item.description ? `<p class="text-sm" style="margin-top:.75rem;color:var(--text2)">${escHtml(item.description)}</p>` : ''}
    ${item.poster_url ? `<img src="${escHtml(item.poster_url)}" style="width:120px;margin-top:.75rem;border-radius:8px" onerror="this.remove()">` : ''}
    <div class="modal-actions">
      <button class="btn btn-primary" id="toggle-watched">${item.watched ? 'Mark Unwatched' : '✓ Mark Watched'}</button>
      <button class="btn btn-danger" id="del-watch">Delete</button>
      <button class="btn btn-ghost modal-close">Close</button>
    </div>
  `, box => {
    box.querySelector('#toggle-watched').addEventListener('click', async () => {
      await App.api(`/watchlist/${item.id}/watched`, { method: 'PUT', body: { watched: !item.watched } });
      App.closeModal(); PAGE_RENDERERS.watchlist();
    });
    box.querySelector('#del-watch').addEventListener('click', async () => {
      if (!confirm('Remove from watchlist?')) return;
      await App.api(`/watchlist/${item.id}`, { method: 'DELETE' });
      App.closeModal(); PAGE_RENDERERS.watchlist();
    });
  });
}

function openWatchModal() {
  App.openModal(`
    <h3>Add to Watchlist</h3>
    <form id="watch-form">
      <label>Title</label>
      <input name="title" required>
      <div class="form-row">
        <div>
          <label>Type</label>
          <select name="type">
            <option value="movie">Movie</option>
            <option value="show">Show</option>
          </select>
        </div>
        <div>
          <label>Year</label>
          <input name="year" type="number" placeholder="2024">
        </div>
      </div>
      <label>Poster URL (optional)</label>
      <input name="poster_url" type="url">
      <label>Description</label>
      <textarea name="description" rows="3"></textarea>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Add</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#watch-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { title: fd.get('title'), type: fd.get('type'), year: fd.get('year') || null, poster_url: fd.get('poster_url') || null, description: fd.get('description') || null };
      try {
        await App.api('/watchlist', { method: 'POST', body });
        App.closeModal(); PAGE_RENDERERS.watchlist();
        App.toast('Added to watchlist', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
