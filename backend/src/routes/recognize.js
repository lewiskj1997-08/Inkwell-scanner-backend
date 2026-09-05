const express = require('express');
const multer = require('multer');
const { getDb } = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ML recognition service URL (FastAPI service on port 8000)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Normalize text for matching
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
}

// Forward an image to the ML service and return its recognition result.
// Returns null if the ML service is unreachable or errors.
async function recognizeViaML(buffer, mimetype, originalname) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype || 'image/jpeg' }), originalname || 'card.jpg');

  const res = await fetch(`${ML_SERVICE_URL}/recognize`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ML service returned ${res.status}: ${text}`);
  }
  return res.json();
}

// POST /recognize - Accept card image + optional hint, return matched cards.
// Proxies the image to the ML recognition service (port 8000) for OCR +
// feature matching. Falls back to text search on the local card DB if the
// ML service is unreachable.
router.post('/', optionalAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const db = getDb();
    const hint = (req.body.hint || '').toString();

    // Record scan usage if authenticated
    if (req.user) {
      const today = new Date().toISOString().split('T')[0];
      db.prepare(
        'INSERT INTO scan_usage (user_id, scan_date) VALUES (?, ?)'
      ).run(req.user.id, today);
    }

    // 1) Try the ML service for real image recognition
    let mlResult = null;
    let mlError = null;
    try {
      mlResult = await recognizeViaML(req.file.buffer, req.file.mimetype, req.file.originalname);
    } catch (err) {
      mlError = err.message;
    }

    // 2) Build a text-search result from the local DB (used as fallback and to
    //    enrich the response with our canonical card rows).
    const terms = normalize(hint).split(' ').filter(Boolean);
    let localCards;
    if (terms.length > 0) {
      const placeholders = terms.map(() => 'card_name LIKE ?').join(' OR ');
      const params = terms.map(t => `%${t}%`);
      const sql = `SELECT * FROM cards WHERE ${placeholders} LIMIT 20`;
      localCards = db.prepare(sql).all(...params);

      localCards = localCards.map(c => {
        const nameLower = c.card_name.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (nameLower.includes(term)) score += 1;
        }
        const nameTokens = normalize(c.card_name).split(' ');
        for (const term of terms) {
          if (nameTokens.includes(term)) score += 0.5;
        }
        return { ...c, _score: score };
      });
      localCards.sort((a, b) => b._score - a._score);
      localCards = localCards.map(({ _score, ...c }) => c);
    } else {
      localCards = db.prepare('SELECT * FROM cards ORDER BY rarity ASC, card_name ASC LIMIT 10').all();
    }

    // 3) If the ML service produced a usable match, prefer it.
    if (mlResult && mlResult.success !== false && (mlResult.card_name || mlResult.confidence != null)) {
      // Map the ML card back to our DB row for a stable id/quantity flow.
      const name = mlResult.card_name || mlResult.name;
      const setCode = mlResult.set_code || (mlResult.set_name ? null : null);
      let dbCard = null;
      if (name) {
        dbCard = db.prepare('SELECT * FROM cards WHERE card_name = ? LIMIT 1').get(name);
      }
      return res.json({
        success: true,
        method: 'ml_recognition',
        card: mlResult,
        card_name: name || null,
        set_name: mlResult.set_name || null,
        set_code: mlResult.set_code || null,
        set_number: mlResult.set_number || null,
        confidence: mlResult.confidence ?? null,
        ocr_extracted: mlResult.ocr_extracted || null,
        db_match: dbCard || null,
        image_size: req.file.size,
      });
    }

    // 4) Fallback: text search on the local DB.
    res.json({
      success: true,
      method: hint ? 'text_search' : 'random_suggestion',
      matches: localCards.slice(0, 10),
      total_matches: localCards.length,
      image_size: req.file.size,
      ml_service: mlError ? { available: false, error: mlError } : { available: true },
      hint: mlError
        ? `ML recognition unavailable (${mlError}) — send a text hint for better results.`
        : 'Image recognition produced no confident match — send a text hint to narrow results.',
    });
  } catch (err) {
    console.error('Recognition error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /recognize/search - Text-only card search
router.post('/search', (req, res) => {
  try {
    const db = getDb();
    const { query, set_name, card_type, ink_color, rarity, limit } = req.body;

    let where = [];
    let params = [];

    if (query) {
      const terms = normalize(query).split(' ').filter(Boolean);
      const parts = terms.map(() => 'card_name LIKE ?');
      where.push(`(${parts.join(' OR ')})`);
      params.push(...terms.map(t => `%${t}%`));
    }
    if (set_name) { where.push('set_name = ?'); params.push(set_name); }
    if (card_type) { where.push('card_type = ?'); params.push(card_type); }
    if (ink_color) { where.push('ink_color = ?'); params.push(ink_color); }
    if (rarity) { where.push('rarity = ?'); params.push(rarity); }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const resultLimit = Math.min(parseInt(limit) || 20, 50);

    const cards = db.prepare(
      `SELECT * FROM cards ${whereSQL} ORDER BY card_name LIMIT ?`
    ).all(...params, resultLimit);

    res.json({ success: true, cards, total: cards.length });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /recognize/status - Check recognition service status
router.get('/status', async (req, res) => {
  try {
    const db = getDb();
    const cardCount = db.prepare('SELECT COUNT(*) as count FROM cards').get();

    let mlAvailable = false;
    let mlInfo = null;
    try {
      const r = await fetch(`${ML_SERVICE_URL}/health`);
      if (r.ok) {
        mlAvailable = true;
        mlInfo = await r.json();
      }
    } catch (_) {
      mlAvailable = false;
    }

    res.json({
      status: 'ok',
      mode: mlAvailable ? 'full' : 'lite',
      cards_available: cardCount.count,
      ocr_available: mlAvailable,
      ml_service: mlAvailable ? mlInfo : { available: false },
      ocr_available_message: mlAvailable
        ? 'Image-based OCR + feature matching available via ML service.'
        : 'Text-based recognition only. ML service (port 8000) is unavailable.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
