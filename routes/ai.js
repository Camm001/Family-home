const router = require('express').Router();
const auth = require('../middleware/auth');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://10.0.0.243:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || 'llava:7b';

async function chat(messages, maxTokens = 2048) {
  const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      max_tokens: maxTokens,
      stream: false
    })
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

function ollamaReachable() {
  return !!(OLLAMA_BASE_URL);
}

const noAI = (res) => res.status(503).json({ error: 'AI features not configured' });

// Meal plan generator
router.post('/meal-plan', auth, async (req, res) => {
  if (!ollamaReachable()) return noAI(res);
  const { restrictions, servings, fridge_contents, nights } = req.body;

  const prompt = `Generate a ${nights || 7}-night dinner meal plan.
Dietary restrictions: ${restrictions || 'none'}
Servings needed: ${servings || 4}
Ingredients currently available: ${fridge_contents || 'standard pantry items'}

Return a JSON object with this exact shape:
{
  "meals": [
    { "day": "Monday", "dinner": "Meal Name", "recipe": { "title": "Meal Name", "ingredients": ["item 1", "item 2"], "instructions": "Step by step...", "servings": 4 } }
  ]
}
Only return the JSON object, no other text.`;

  try {
    const text = await chat([{ role: 'user', content: prompt }], 2048);
    const json = JSON.parse(text.replace(/^```json\n?|```$/g, ''));
    res.json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Receipt scanner (vision)
router.post('/scan-receipt', auth, async (req, res) => {
  if (!ollamaReachable()) return noAI(res);
  const { image_base64, media_type } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'image_base64 required' });

  const mime = media_type || 'image/jpeg';
  const messages = [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${image_base64}` } },
      { type: 'text', text: 'Extract the expense details from this receipt. Return JSON only: { "total": 0.00, "date": "YYYY-MM-DD", "description": "store/vendor name", "items": [{ "name": "...", "amount": 0.00 }] }. No other text.' }
    ]
  }];

  try {
    const text = await chat(messages, 1024);
    res.json(JSON.parse(text.replace(/^```json\n?|```$/g, '')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Document summarizer (vision for images; text extraction for PDFs not supported by llava)
router.post('/summarize-doc', auth, async (req, res) => {
  if (!ollamaReachable()) return noAI(res);
  const db = req.app.locals.db;
  const { document_id } = req.body;
  if (!document_id) return res.status(400).json({ error: 'document_id required' });

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(document_id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const isPdf = doc.original_name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return res.status(422).json({ error: 'PDF summarization is not supported with the current AI model. Upload an image (JPG/PNG) of the document instead.' });
  }

  const fs   = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', 'data', 'documents', doc.filename);

  try {
    const base64 = fs.readFileSync(filePath).toString('base64');
    const messages = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: 'Write a plain-English summary (2-4 sentences) of this document. Focus on the most important information a family member would need to know (key dates, amounts, account numbers, coverage, etc.). Be concise.' }
      ]
    }];
    const summary = await chat(messages, 512);
    db.prepare('UPDATE documents SET summary = ? WHERE id = ?').run(summary, document_id);
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shopping suggestion
router.post('/shopping-suggest', auth, async (req, res) => {
  if (!ollamaReachable()) return noAI(res);
  const db = req.app.locals.db;
  const { list_id } = req.body;

  const currentItems  = db.prepare('SELECT text FROM list_items WHERE list_id = ? AND checked = 0').all(list_id).map(i => i.text);
  const recentChecked = db.prepare('SELECT text FROM list_items WHERE list_id = ? AND checked = 1 ORDER BY updated_at DESC LIMIT 50').all(list_id).map(i => i.text);

  const prompt = `Family shopping list assistant. Current unchecked items: ${currentItems.join(', ') || 'none'}.
Recent purchases from this list: ${recentChecked.join(', ') || 'none'}.
Suggest 5-8 items that are likely forgotten or commonly needed. Return a JSON array of strings only. Example: ["Milk", "Eggs"]. No other text.`;

  try {
    const text = await chat([{ role: 'user', content: prompt }], 256);
    res.json({ suggestions: JSON.parse(text.replace(/^```json\n?|```$/g, '')) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
