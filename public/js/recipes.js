PAGE_RENDERERS.recipes = async function () {
  const recipes = await App.api('/recipes');
  renderRecipes(recipes);
};

function renderRecipes(recipes) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header">
      <h2>Recipes</h2>
      <button class="btn btn-primary" id="add-recipe-btn">+ Add Recipe</button>
    </div>
    ${recipes.length === 0 ? '<div class="empty-state"><div class="empty-icon">📖</div><p>No recipes yet.</p></div>' : ''}
    <div class="grid-2" id="recipe-grid">
      ${recipes.map(r => `
        <div class="recipe-card card" data-id="${r.id}" style="cursor:pointer">
          <div class="card-header">
            <div class="recipe-title">${escHtml(r.title)}</div>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-ghost recipe-edit">Edit</button>
              <button class="btn btn-sm btn-ghost recipe-delete">✕</button>
            </div>
          </div>
          ${r.tags ? `<div class="recipe-tags">${r.tags.split(',').map(t => `<span>${escHtml(t.trim())}</span>`).join('')}</div>` : ''}
          ${r.servings ? `<p class="text-sm text-muted mt-4">Serves ${r.servings}</p>` : ''}
          ${r.source_url ? `<a href="${escHtml(r.source_url)}" target="_blank" rel="noopener" class="text-xs text-muted" style="color:var(--accent)">Source ↗</a>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('add-recipe-btn').addEventListener('click', () => openRecipeModal());

  document.getElementById('recipe-grid').addEventListener('click', async e => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = parseInt(card.dataset.id);

    if (e.target.classList.contains('recipe-delete')) {
      if (!confirm('Delete this recipe?')) return;
      await App.api(`/recipes/${id}`, { method: 'DELETE' });
      PAGE_RENDERERS.recipes();
      return;
    }
    if (e.target.classList.contains('recipe-edit')) {
      const recipe = await App.api(`/recipes/${id}`);
      openRecipeModal(recipe);
      return;
    }
    // View recipe
    const recipe = await App.api(`/recipes/${id}`);
    openRecipeView(recipe);
  });
}

function openRecipeView(recipe) {
  App.openModal(`
    <h3>${escHtml(recipe.title)}</h3>
    ${recipe.servings ? `<p class="text-sm text-muted">Serves ${recipe.servings}</p>` : ''}
    <h4 style="margin-top:1rem;margin-bottom:.5rem;font-size:.9rem">Ingredients</h4>
    <ul class="ingredient-list">
      ${(recipe.ingredients || []).map(i => `<li>${escHtml(typeof i === 'string' ? i : i.name || JSON.stringify(i))}</li>`).join('')}
    </ul>
    ${recipe.instructions ? `<h4 style="margin-top:1rem;margin-bottom:.5rem;font-size:.9rem">Instructions</h4><p class="text-sm" style="white-space:pre-wrap;color:var(--text2)">${escHtml(recipe.instructions)}</p>` : ''}
    <div class="modal-actions">
      <button class="btn btn-ghost modal-close">Close</button>
    </div>
  `);
}

function openRecipeModal(recipe = {}) {
  const isEdit = !!recipe.id;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : '';
  App.openModal(`
    <h3>${isEdit ? 'Edit' : 'New'} Recipe</h3>
    <form id="recipe-form">
      <label>Title</label>
      <input name="title" required value="${escHtml(recipe.title || '')}">
      <label>Ingredients (one per line)</label>
      <textarea name="ingredients" rows="6">${escHtml(ingredients)}</textarea>
      <label>Instructions</label>
      <textarea name="instructions" rows="4">${escHtml(recipe.instructions || '')}</textarea>
      <div class="form-row">
        <div>
          <label>Servings</label>
          <input name="servings" type="number" min="1" value="${recipe.servings || ''}">
        </div>
        <div>
          <label>Tags (comma-separated)</label>
          <input name="tags" value="${escHtml(recipe.tags || '')}">
        </div>
      </div>
      <label>Source URL</label>
      <input name="source_url" type="url" value="${escHtml(recipe.source_url || '')}">
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    box.querySelector('#recipe-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const ingredients = fd.get('ingredients').split('\n').map(s => s.trim()).filter(Boolean);
      const body = { title: fd.get('title'), ingredients, instructions: fd.get('instructions'), servings: fd.get('servings') ? parseInt(fd.get('servings')) : null, tags: fd.get('tags'), source_url: fd.get('source_url') };
      try {
        if (isEdit) await App.api(`/recipes/${recipe.id}`, { method: 'PUT', body });
        else await App.api('/recipes', { method: 'POST', body });
        App.closeModal(); PAGE_RENDERERS.recipes();
        App.toast(isEdit ? 'Recipe saved' : 'Recipe added', 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
