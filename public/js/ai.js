// AI module — standalone helpers and any future AI UI
// Most AI functionality is embedded in the relevant feature modules
// (meals.js uses /ai/meal-plan, expenses.js uses /ai/scan-receipt, etc.)

// Global AI status check
App.checkAI = async function () {
  try {
    await App.api('/ai/shopping-suggest', { method: 'POST', body: { list_id: 0 } });
    return true;
  } catch (e) {
    return e.message !== 'AI features not configured';
  }
};
