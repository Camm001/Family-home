const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

PAGE_RENDERERS.board = async function () {
  const posts = await App.api('/board');
  renderBoard(posts);

  document.addEventListener('ws:post:new', e => {
    const list = document.getElementById('post-list');
    if (list) list.insertAdjacentHTML('afterbegin', renderPost({ ...e.detail, my_reactions: [] }));
  });
  document.addEventListener('ws:post:react', e => {
    const btns = document.querySelectorAll(`[data-post-id="${e.detail.post_id}"] .reaction-btn`);
    btns.forEach(btn => {
      const count = e.detail.reactions.find(r => r.emoji === btn.dataset.emoji)?.count || 0;
      btn.querySelector('.r-count').textContent = count ? ` ${count}` : '';
    });
  });
};

function renderBoard(posts) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <h2>Message Board</h2>
      <button class="btn btn-primary" id="new-post-btn">+ New Post</button>
    </div>
    ${posts.length === 0 ? '<div class="empty-state"><div class="empty-icon">📌</div><p>No posts yet.</p></div>' : ''}
    <div id="post-list">
      ${posts.map(p => renderPost(p)).join('')}
    </div>
  `;

  document.getElementById('new-post-btn').addEventListener('click', () => openPostModal());

  document.getElementById('post-list').addEventListener('click', async e => {
    const postEl = e.target.closest('[data-post-id]');
    if (!postEl) return;
    const id = parseInt(postEl.dataset.postId);

    if (e.target.classList.contains('post-edit')) {
      const post = { id, title: postEl.querySelector('.post-title').textContent, body: postEl.querySelector('.post-body').textContent };
      openPostModal(post);
    } else if (e.target.classList.contains('post-delete')) {
      if (!confirm('Delete post?')) return;
      await App.api(`/board/${id}`, { method: 'DELETE' });
      postEl.remove();
    } else if (e.target.classList.contains('post-pin')) {
      const pinned = postEl.classList.contains('pinned');
      await App.api(`/board/${id}`, { method: 'PUT', body: { pinned: !pinned } });
      PAGE_RENDERERS.board();
    } else if (e.target.closest('.reaction-btn')) {
      const btn = e.target.closest('.reaction-btn');
      await App.api(`/board/${id}/react`, { method: 'POST', body: { emoji: btn.dataset.emoji } });
      btn.classList.toggle('mine');
    }
  });
}

function renderPost(p) {
  const isOwner = p.user_id === App.user.id;
  const isAdmin = App.user.role === 'admin';
  return `<div class="post-card${p.pinned ? ' pinned' : ''}" data-post-id="${p.id}">
    <div class="post-header">
      <div class="post-author-dot" style="background:${escHtml(p.user_color || '#6366f1')}"></div>
      <span class="post-title">${escHtml(p.title)}</span>
      <span class="post-meta">${escHtml(p.user_name)} · ${relativeTime(p.created_at)}</span>
      <div class="flex gap-2 ml-auto">
        ${isAdmin ? `<button class="btn btn-sm btn-ghost post-pin">${p.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
        ${isOwner || isAdmin ? `<button class="btn btn-sm btn-ghost post-edit">Edit</button><button class="btn btn-sm btn-ghost post-delete">✕</button>` : ''}
      </div>
    </div>
    <div class="post-body">${escHtml(p.body)}</div>
    <div class="post-reactions">
      ${REACTIONS.map(emoji => {
        const count = (p.reactions || []).find(r => r.emoji === emoji)?.count || 0;
        const mine = (p.my_reactions || []).includes(emoji);
        return `<button class="reaction-btn${mine ? ' mine' : ''}" data-emoji="${emoji}">${emoji}<span class="r-count">${count ? ' ' + count : ''}</span></button>`;
      }).join('')}
    </div>
  </div>`;
}

function openPostModal(post = {}) {
  const isEdit = !!post.id;
  App.openModal(`
    <h3>${isEdit ? 'Edit' : 'New'} Post</h3>
    <form id="post-form">
      <label>Title</label>
      <input name="title" required value="${escHtml(post.title || '')}">
      <label>Body</label>
      <textarea name="body" rows="5" required>${escHtml(post.body || '')}</textarea>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Post'}</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#post-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { title: fd.get('title'), body: fd.get('body') };
      try {
        if (isEdit) await App.api(`/board/${post.id}`, { method: 'PUT', body });
        else await App.api('/board', { method: 'POST', body });
        App.closeModal();
        PAGE_RENDERERS.board();
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}

function relativeTime(str) {
  const d = new Date(str);
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}
window.relativeTime = relativeTime;
