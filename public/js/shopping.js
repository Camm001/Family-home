let shoppingState = { lists: [], activeListId: null };

PAGE_RENDERERS.shopping = async function () {
  shoppingState.lists = await App.api('/shopping/lists').catch(() => []);
  if (shoppingState.lists.length && !shoppingState.activeListId) {
    shoppingState.activeListId = shoppingState.lists[0].id;
  }
  renderShoppingPage();

  document.addEventListener('ws:shopping:item_added', onWsItemAdded);
  document.addEventListener('ws:shopping:item_checked', onWsItemChecked);
  document.addEventListener('ws:shopping:item_deleted', onWsItemDeleted);
  document.addEventListener('ws:shopping:cleared_checked', onWsClearedChecked);
};

function renderShoppingPage() {
  const content = document.getElementById('content');
  const lists = shoppingState.lists;
  content.innerHTML = `
    <div class="section-header">
      <h2>Shopping Lists</h2>
      <button class="btn btn-primary" id="new-list-btn">+ New List</button>
    </div>
    <div class="list-tabs" id="list-tabs">
      ${lists.map(l => `<button class="list-tab${l.id === shoppingState.activeListId ? ' active' : ''}" data-id="${l.id}">${escHtml(l.name)} <span class="text-muted">(${l.pending_count || 0})</span></button>`).join('')}
    </div>
    <div id="list-items-container"></div>
    ${lists.length === 0 ? '<div class="empty-state"><div class="empty-icon">🛒</div><p>No lists yet. Create one to get started.</p></div>' : ''}
  `;

  document.getElementById('new-list-btn').addEventListener('click', () => {
    App.openModal(`
      <h3>New Shopping List</h3>
      <form id="new-list-form">
        <label>List Name</label>
        <input name="name" placeholder="Groceries, Costco..." required>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Create</button>
          <button type="button" class="btn btn-ghost modal-close">Cancel</button>
        </div>
      </form>
    `, box => {
      box.querySelector('#new-list-form').addEventListener('submit', async e => {
        e.preventDefault();
        const name = new FormData(e.target).get('name');
        const list = await App.api('/shopping/lists', { method: 'POST', body: { name } });
        shoppingState.lists.unshift({ ...list, pending_count: 0, total_count: 0 });
        shoppingState.activeListId = list.id;
        App.closeModal();
        renderShoppingPage();
        loadListItems();
      });
    });
  });

  document.getElementById('list-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.list-tab');
    if (!btn) return;
    shoppingState.activeListId = parseInt(btn.dataset.id);
    document.querySelectorAll('.list-tab').forEach(b => b.classList.toggle('active', parseInt(b.dataset.id) === shoppingState.activeListId));
    loadListItems();
  });

  if (shoppingState.activeListId) loadListItems();
}

async function loadListItems() {
  const listId = shoppingState.activeListId;
  const container = document.getElementById('list-items-container');
  if (!container || !listId) return;

  const activeList = shoppingState.lists.find(l => l.id === listId);
  const items = await App.api(`/shopping/lists/${listId}/items`).catch(() => []);

  container.innerHTML = `
    <div class="card" style="margin-top:.5rem">
      <div class="card-header">
        <span class="card-title">${escHtml(activeList?.name || '')}</span>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-ghost" id="suggest-btn">✨ Suggest</button>
          <button class="btn btn-sm btn-ghost" id="clear-checked-btn">Clear checked</button>
          <button class="btn btn-sm btn-danger" id="delete-list-btn">Delete list</button>
        </div>
      </div>

      <div id="items-list">
        ${items.map(renderItem).join('') || '<p class="text-muted text-sm">List is empty</p>'}
      </div>

      <div class="add-item-row">
        <input id="new-item-input" placeholder="Add item..." type="text">
        <button class="btn btn-primary" id="add-item-btn">Add</button>
      </div>
    </div>
  `;

  document.getElementById('add-item-btn').addEventListener('click', addItem);
  document.getElementById('new-item-input').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });

  document.getElementById('clear-checked-btn').addEventListener('click', async () => {
    await App.api(`/shopping/lists/${listId}/checked`, { method: 'DELETE' });
    loadListItems();
  });

  document.getElementById('delete-list-btn').addEventListener('click', async () => {
    if (!confirm('Delete this list?')) return;
    await App.api(`/shopping/lists/${listId}`, { method: 'DELETE' });
    shoppingState.lists = shoppingState.lists.filter(l => l.id !== listId);
    shoppingState.activeListId = shoppingState.lists[0]?.id || null;
    renderShoppingPage();
    if (shoppingState.activeListId) loadListItems();
  });

  document.getElementById('suggest-btn').addEventListener('click', suggestItems);

  document.getElementById('items-list').addEventListener('click', async e => {
    const item = e.target.closest('[data-item-id]');
    if (!item) return;
    const id = parseInt(item.dataset.itemId);
    if (e.target.classList.contains('item-del')) {
      await App.api(`/shopping/items/${id}`, { method: 'DELETE' });
      item.remove();
      return;
    }
    if (e.target.type === 'checkbox') {
      await App.api(`/shopping/items/${id}/check`, { method: 'PUT', body: { checked: e.target.checked } });
    }
  });
}

function renderItem(item) {
  return `<div class="shopping-item${item.checked ? ' checked' : ''}" data-item-id="${item.id}">
    <input type="checkbox" ${item.checked ? 'checked' : ''}>
    <span class="item-text">${escHtml(item.text)}</span>
    ${item.added_by_name ? `<span class="item-meta">${escHtml(item.added_by_name)}</span>` : ''}
    <button class="btn btn-sm btn-ghost btn-icon item-del">✕</button>
  </div>`;
}

async function addItem() {
  const input = document.getElementById('new-item-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    const item = await App.api(`/shopping/lists/${shoppingState.activeListId}/items`, { method: 'POST', body: { text } });
    const list = document.getElementById('items-list');
    if (list) list.insertAdjacentHTML('beforeend', renderItem(item));
  } catch (e) { App.toast(e.message, 'error'); }
}

async function suggestItems() {
  const btn = document.getElementById('suggest-btn');
  btn.textContent = '⏳ Thinking...';
  btn.disabled = true;
  try {
    const { suggestions } = await App.api('/ai/shopping-suggest', { method: 'POST', body: { list_id: shoppingState.activeListId } });
    App.openModal(`
      <h3>✨ Suggested Items</h3>
      <p class="text-muted text-sm" style="margin-bottom:.75rem">Select items to add:</p>
      <div id="suggestions-list">${suggestions.map(s => `<label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;cursor:pointer"><input type="checkbox" checked style="width:auto"> ${escHtml(s)}</label>`).join('')}</div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="add-suggestions">Add Selected</button>
        <button class="btn btn-ghost modal-close">Cancel</button>
      </div>
    `, box => {
      box.querySelector('#add-suggestions').addEventListener('click', async () => {
        const labels = box.querySelectorAll('#suggestions-list label');
        const toAdd = [];
        labels.forEach((label, i) => { if (label.querySelector('input').checked) toAdd.push(suggestions[i]); });
        for (const text of toAdd) {
          await App.api(`/shopping/lists/${shoppingState.activeListId}/items`, { method: 'POST', body: { text } });
        }
        App.closeModal();
        loadListItems();
        App.toast(`Added ${toAdd.length} items`, 'success');
      });
    });
  } catch (e) { App.toast(e.message, 'error'); }
  finally { btn.textContent = '✨ Suggest'; btn.disabled = false; }
}

// WebSocket handlers
function onWsItemAdded(e) {
  if (e.detail.list_id !== shoppingState.activeListId) return;
  const list = document.getElementById('items-list');
  if (list) list.insertAdjacentHTML('beforeend', renderItem(e.detail.item));
}
function onWsItemChecked(e) {
  const el = document.querySelector(`[data-item-id="${e.detail.item.id}"]`);
  if (!el) return;
  el.classList.toggle('checked', !!e.detail.item.checked);
  el.querySelector('input[type="checkbox"]').checked = !!e.detail.item.checked;
}
function onWsItemDeleted(e) {
  document.querySelector(`[data-item-id="${e.detail.id}"]`)?.remove();
}
function onWsClearedChecked(e) {
  if (e.detail.list_id !== shoppingState.activeListId) return;
  document.querySelectorAll('.shopping-item.checked').forEach(el => el.remove());
}
