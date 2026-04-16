const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekStart(offset = 0) {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1 + offset * 7);
  return d.toISOString().split('T')[0];
}

let mealsWeekOffset = 0;

PAGE_RENDERERS.meals = async function () {
  mealsWeekOffset = 0;
  await renderMealsPage();
};

async function renderMealsPage() {
  const weekStart = getWeekStart(mealsWeekOffset);
  const [meals, recipes, lists] = await Promise.all([
    App.api(`/meals?week_start=${weekStart}`),
    App.api('/recipes'),
    App.api('/shopping/lists').catch(() => [])
  ]);

  const content = document.getElementById('content');
  const mealMap = {};
  meals.forEach(m => { mealMap[`${m.date}_${m.meal_type}`] = m; });

  const weekDates = DAYS.map((day, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { day, date: d.toISOString().split('T')[0] };
  });

  content.innerHTML = `
    <div class="section-header">
      <h2>Meal Planner</h2>
      <div class="flex gap-2 items-center">
        <button class="btn btn-sm btn-ghost" id="prev-week">← Prev</button>
        <span class="text-sm text-muted">${weekStart}</span>
        <button class="btn btn-sm btn-ghost" id="next-week">Next →</button>
        <button class="btn btn-primary btn-sm" id="ai-meals-btn">✨ AI Plan</button>
        ${lists.length ? `<button class="btn btn-sm btn-secondary" id="gen-list-btn">→ Shopping List</button>` : ''}
      </div>
    </div>
    <div class="meal-grid" id="meal-grid">
      ${weekDates.map(({ day, date }) => `
        <div class="meal-day">
          <div class="meal-day-label">${day.slice(0, 3)}<br><span class="text-xs" style="font-weight:400">${date.slice(5)}</span></div>
          ${MEAL_TYPES.map(type => {
            const m = mealMap[`${date}_${type}`];
            return `<div class="meal-slot" data-date="${date}" data-type="${type}">
              <span class="meal-slot-label">${type}</span>
              ${m ? `<span class="meal-slot-name">${escHtml(m.recipe_title || m.custom_meal || '')}</span>` : `<span class="meal-empty">+</span>`}
            </div>`;
          }).join('')}
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('prev-week').addEventListener('click', () => { mealsWeekOffset--; renderMealsPage(); });
  document.getElementById('next-week').addEventListener('click', () => { mealsWeekOffset++; renderMealsPage(); });

  document.getElementById('ai-meals-btn').addEventListener('click', () => openAIMealModal(weekStart, recipes));

  if (lists.length) {
    document.getElementById('gen-list-btn').addEventListener('click', () => openGenListModal(weekStart, lists));
  }

  document.getElementById('meal-grid').addEventListener('click', e => {
    const slot = e.target.closest('.meal-slot');
    if (!slot) return;
    openMealModal(slot.dataset.date, slot.dataset.type, mealMap[`${slot.dataset.date}_${slot.dataset.type}`], recipes);
  });
}

function openMealModal(date, type, existing, recipes) {
  App.openModal(`
    <h3>Set ${type} — ${date}</h3>
    <form id="meal-form">
      <label>Recipe</label>
      <select name="recipe_id">
        <option value="">— Custom —</option>
        ${recipes.map(r => `<option value="${r.id}" ${existing?.recipe_id === r.id ? 'selected' : ''}>${escHtml(r.title)}</option>`).join('')}
      </select>
      <label>Or custom meal name</label>
      <input name="custom_meal" value="${escHtml(existing?.custom_meal || '')}">
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        ${existing ? `<button type="button" class="btn btn-danger" id="clear-slot">Clear</button>` : ''}
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
  `, box => {
    if (existing) {
      box.querySelector('#clear-slot').addEventListener('click', async () => {
        await App.api('/meals', { method: 'POST', body: { date, meal_type: type } });
        App.closeModal(); renderMealsPage();
      });
    }
    box.querySelector('#meal-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await App.api('/meals', { method: 'POST', body: { date, meal_type: type, recipe_id: fd.get('recipe_id') || null, custom_meal: fd.get('custom_meal') || null } });
      App.closeModal(); renderMealsPage();
    });
  });
}

function openAIMealModal(weekStart, recipes) {
  App.openModal(`
    <h3>✨ AI Meal Planner</h3>
    <form id="ai-meal-form">
      <label>Dietary restrictions</label>
      <input name="restrictions" placeholder="e.g. gluten-free, no nuts">
      <label>Servings</label>
      <input name="servings" type="number" value="4" min="1">
      <label>What's in the fridge?</label>
      <textarea name="fridge_contents" placeholder="chicken, pasta, tomatoes..."></textarea>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Generate Plan</button>
        <button type="button" class="btn btn-ghost modal-close">Cancel</button>
      </div>
    </form>
    <div id="ai-result"></div>
  `, box => {
    box.querySelector('#ai-meal-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const result = box.querySelector('#ai-result');
      result.innerHTML = '<div class="ai-loading">Generating your meal plan...</div>';
      try {
        const plan = await App.api('/ai/meal-plan', { method: 'POST', body: { restrictions: fd.get('restrictions'), servings: parseInt(fd.get('servings')), fridge_contents: fd.get('fridge_contents'), nights: 7 } });
        // Apply plan to current week
        for (const meal of plan.meals) {
          const dayIndex = DAYS.indexOf(meal.day);
          if (dayIndex === -1) continue;
          const d = new Date(weekStart);
          d.setDate(d.getDate() + dayIndex);
          const date = d.toISOString().split('T')[0];
          await App.api('/meals', { method: 'POST', body: { date, meal_type: 'dinner', custom_meal: meal.dinner } });
        }
        App.closeModal();
        renderMealsPage();
        App.toast('Meal plan applied!', 'success');
      } catch (err) {
        result.innerHTML = `<p class="text-danger text-sm">${escHtml(err.message)}</p>`;
      }
    });
  });
}

function openGenListModal(weekStart, lists) {
  App.openModal(`
    <h3>Generate Shopping List</h3>
    <p class="text-muted text-sm">Add ingredients from this week's meal plan to a shopping list.</p>
    <label>Target List</label>
    <select id="target-list">
      ${lists.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('')}
    </select>
    <div class="modal-actions">
      <button class="btn btn-primary" id="do-gen">Generate</button>
      <button class="btn btn-ghost modal-close">Cancel</button>
    </div>
  `, box => {
    box.querySelector('#do-gen').addEventListener('click', async () => {
      const list_id = parseInt(box.querySelector('#target-list').value);
      try {
        const { added } = await App.api('/meals/generate-list', { method: 'POST', body: { week_start: weekStart, list_id } });
        App.closeModal();
        App.toast(`Added ${added} ingredients to list`, 'success');
      } catch (err) { App.toast(err.message, 'error'); }
    });
  });
}
