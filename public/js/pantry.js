PAGE_RENDERERS.pantry = async function () {
  const [items, lists] = await Promise.all([App.api('/pantry'), App.api('/shopping/lists').catch(() => [])]);
  renderPantry(items, lists);
};

function renderPantry(items, lists) {
  const content = document.getElementById('content');
  const low = items.filter(i => i.current_stock <= i.threshold);
  const ok = items.filter(i => i.current_stock > i.threshold);

  content.innerHTML = `
    <div class="section-header">
      <h2>Pantry</h2>
      <button class="btn btn-primary" id="add-pantry-btn">+ Add Item</button>
    </div>

    ${low.length ? `
      <div style="margin-bottom:1.5rem">
        <h3 class="text-sm text-muted" style="margin-bottom:.5rem">⚠️ RUNNING LOW (${low.length})</h3>
        ${low.map(i => renderPantryItem(i, true)).join('')}
      </div>
    ` : ''}

    <div>
      <h3 class="text-sm text-muted" style="margin-bottom:.5rem">✅ STOCKED (${ok.length})</h3>
      ${ok.map(i => renderPantryItem(i, false)).join('')}
      ${items.length === 0 ? '<div class="empty-state"><div class="empty-icon">🥫</div><p>No pantry items tracked yet.</p></div>' : ''}
    </div>
  `;

  document.getElementById('add-pantry-btn').addEventListener('click', () => openPantryModal({}, lists));

  document.getElementById('content').addEventListener('click', async e => {
    const row = e.target.closest('[data-pantry-id]');
    if (!row) return;
    const id = parseInt(row.dataset.pantryId);
    const item = items.find(i => i.id === id);

    if (e.target.classList.contains('pantry-out')) {
      await App.api(`/pantry/${id}/out`, { method: 'POST' });
      App.toast(`${item.name} marked as out`, 'success');
      PAGE_RENDERERS.pantry();
    } else if (e.target.classList.contains('pantry-inc')) {
      await App.api(`/pantry/${id}`, { method: 'PUT', body: { current_stock: item.current_stock + 1 } });
      PAGE_RENDERERS.pantry();
    } else if (e.target.classList.contains('pantry-dec') && item.current_stock > 0) {
      await App.api(`/pantry/${id}`, { method: 'PUT', body: { current_stock: item.current_stock - 1 } });
      PAGE_RENDERERS.pantry();
    } else if (e.target.classList.contains('pantry-edit')) {
      openPantryModal(item, lists);
    } else if (e.target.classList.contains('pantry-delete')) {
      if (!confirm('Remove this item?')) return;
      await App.api(`/pantry/${id}`, { method: 'DELETE' });
      PAGE_RENDERERS.pantry();
    }
  });
}

function renderPantryItem(item, isLow) {
  return `<div class="pantry-item" data-pantry-id="${item.id}">
    <div class="pantry-stock ${isLow ? 'low' : 'ok'}">${item.current_stock}<span class="text-xs" style="display:block;font-weight:400">${item.unit}</span></div>
    <div class="pantry-info">
      <div class="pantry-name">${escHtml(item.name)}</div>
      <div class="pantry-meta">Min: ${item.threshold} ${item.unit}${item.auto_add_to_list && item.list_name ? ` · Auto-adds to ${item.list_name}` : ''}</div>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-sm btn-ghost pantry-dec">−</button>
      <button class="btn btn-sm btn-ghost pantry-inc">+</button>
      <button class="btn btn-sm btn-danger pantry-out">Out</button>
      <button class="btn btn-sm btn-ghost pantry-edit">Edit</button>
      <button class="btn btn-sm btn-ghost pantry-delete">✕</button>
    </div>
  </div>`;
}

function openPantryModal(item = {}, lists = []) {
  const isEdit = !!item.id;
  App.openModal(`
    <h3>${isEdit ? 'Edit' : 'New'} Pantry Item</h3>
    <form id="pantry-form">
      <label>Item Name</label>
      <input name="name" required value="${escHtml(item.name || '')}">
      <div class="form-row">
        <div>
          <label>Current Stock</label>
          <input name="current_stock" type="number" min="0" value="${item.current_stock !== undefined ? item.current_stock : 1}">
        </div>
        <div>
          <label>Low Threshold</label>
          <input name="threshold" type="number" min="0" value="${item.threshold || 1}">
        </div>
      </div>
      <label>Unit</label>
      <input name="unit" value="${escHtml(item.unit || 'unit')}">
      <label>Auto-add to shopping list when low</label>
      <input type="checkbox" name="auto_add_to_list" ${item.auto_add_to_list ? 'checked' : ''}>
      ${lists.length ? `
        <label>Shopping List</label>
        <select name="list_id">
          <option value="">None</option>
          ${lists.map(l => `<option value="${l.id}" ${item.list_id === l.id ? 'selected' : ''}>${escHtml(l.name)}</option>`).join('')}
        </select>
      ` : ''}
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#pantry-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get('name'), current_stock: parseInt(fd.get('current_stock')), threshold: parseInt(fd.get('threshold')),
        unit: fd.get('unit'), auto_add_to_list: fd.get('auto_add_to_list') === 'on', list_id: fd.get('list_id') || null
      };
      try {
        if (isEdit) await App.api(`/pantry/${item.id}`, { method: 'PUT', body });
        else await App.api('/pantry', { method: 'POST', body });
        App.closeModal(); PAGE_RENDERERS.pantry();
        App.toast(isEdit ? 'Updated' : 'Added', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
