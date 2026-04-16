PAGE_RENDERERS.expenses = async function () {
  if (App.user.role === 'child') {
    document.getElementById('content').innerHTML = '<div class="empty-state"><p>Access restricted.</p></div>';
    return;
  }
  const month = new Date().toISOString().slice(0, 7);
  const [expenses, categories, budgets, summary] = await Promise.all([
    App.api(`/expenses?month=${month}`),
    App.api('/expenses/categories'),
    App.api('/expenses/budgets'),
    App.api(`/expenses/summary?month=${month}`)
  ]);
  renderExpenses(expenses, categories, budgets, summary, month);
};

function renderExpenses(expenses, categories, budgets, summary, month) {
  const content = document.getElementById('content');
  const budgetMap = {};
  budgets.forEach(b => budgetMap[b.category_id] = b.monthly_limit);

  content.innerHTML = `
    <div class="section-header">
      <h2>Expenses</h2>
      <div class="flex gap-2">
        <input type="month" id="month-picker" value="${month}" style="width:auto">
        <button class="btn btn-primary" id="add-expense-btn">+ Add</button>
      </div>
    </div>

    <!-- Summary -->
    <div class="grid-2" style="margin-bottom:1.5rem">
      <div class="card">
        <div class="dash-stat-value">$${summary.total.toFixed(2)}</div>
        <div class="dash-stat-label">Total spent in ${month}</div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:.75rem;font-size:.9rem">BY CATEGORY</div>
        ${summary.by_category.filter(c => c.total > 0).map(c => {
          const limit = budgetMap[c.id];
          const pct = limit ? Math.min((c.total / limit) * 100, 100) : 0;
          return `<div style="margin-bottom:.5rem">
            <div class="flex justify-between text-sm"><span>${escHtml(c.name)}</span><span>$${c.total.toFixed(2)}${limit ? ` / $${limit}` : ''}</span></div>
            ${limit ? `<div class="budget-bar"><div class="budget-fill${c.total > limit ? ' over' : ''}" style="width:${pct}%;background:${c.color}"></div></div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Expense list -->
    <div class="expense-list" id="expense-list">
      ${expenses.map(e => renderExpenseItem(e)).join('')}
      ${expenses.length === 0 ? '<div class="empty-state"><p>No expenses this month.</p></div>' : ''}
    </div>
  `;

  document.getElementById('add-expense-btn').addEventListener('click', () => openExpenseModal({}, categories));
  document.getElementById('month-picker').addEventListener('change', async e => {
    const m = e.target.value;
    const [exps, sum] = await Promise.all([App.api(`/expenses?month=${m}`), App.api(`/expenses/summary?month=${m}`)]);
    renderExpenses(exps, categories, budgets, sum, m);
  });

  document.getElementById('expense-list').addEventListener('click', async e => {
    if (e.target.classList.contains('expense-delete')) {
      const id = e.target.dataset.id;
      if (!confirm('Delete expense?')) return;
      await App.api(`/expenses/${id}`, { method: 'DELETE' });
      e.target.closest('[data-expense-id]').remove();
    }
  });
}

function renderExpenseItem(e) {
  return `<div class="expense-item" data-expense-id="${e.id}">
    <div class="expense-dot" style="background:${e.category_color || '#6b7280'}"></div>
    <div class="expense-info">
      <div class="expense-desc">${escHtml(e.description)}</div>
      <div class="expense-meta">${escHtml(e.user_name)} · ${e.date} · ${escHtml(e.category_name || 'Other')}</div>
    </div>
    <div class="expense-amount">$${parseFloat(e.amount).toFixed(2)}</div>
    <button class="btn btn-sm btn-ghost expense-delete" data-id="${e.id}">✕</button>
  </div>`;
}

function openExpenseModal(expense = {}, categories = []) {
  App.openModal(`
    <h3>Add Expense</h3>
    <form id="expense-form" enctype="multipart/form-data">
      <label>Amount</label>
      <input name="amount" type="number" step="0.01" min="0" required placeholder="0.00">
      <label>Description</label>
      <input name="description" required>
      <div class="form-row">
        <div>
          <label>Category</label>
          <select name="category_id">
            <option value="">None</option>
            ${categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Date</label>
          <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <label>Receipt (optional)</label>
      <div class="upload-area" id="receipt-area">
        <input type="file" name="receipt" accept="image/*" id="receipt-input">
        <p class="text-sm text-muted">Or scan with AI ✨</p>
        <p id="receipt-name" class="text-sm text-muted"></p>
      </div>
      <div id="ai-receipt-result" style="margin-top:.5rem"></div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    const area = box.querySelector('#receipt-area');
    const input = box.querySelector('#receipt-input');
    area.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      if (!input.files[0]) return;
      box.querySelector('#receipt-name').textContent = input.files[0].name;
      // Try AI scan
      const result = box.querySelector('#ai-receipt-result');
      result.innerHTML = '<div class="ai-loading">Scanning receipt...</div>';
      try {
        const reader = new FileReader();
        reader.onload = async ev => {
          const base64 = ev.target.result.split(',')[1];
          const data = await App.api('/ai/scan-receipt', { method: 'POST', body: { image_base64: base64, media_type: input.files[0].type } });
          if (data.total) box.querySelector('[name="amount"]').value = data.total;
          if (data.description) box.querySelector('[name="description"]').value = data.description;
          if (data.date) box.querySelector('[name="date"]').value = data.date;
          result.innerHTML = `<p class="text-success text-sm">✓ Receipt scanned</p>`;
        };
        reader.readAsDataURL(input.files[0]);
      } catch { result.innerHTML = ''; }
    });

    box.querySelector('#expense-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await App.apiForm('/expenses', fd);
        App.closeModal(); PAGE_RENDERERS.expenses();
        App.toast('Expense saved', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
