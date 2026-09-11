const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /cards - List all cards (paginated, filterable)
router.get('/', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (req.query.card_name) {
      whereClauses.push('card_name LIKE ?');
      params.push(`%${req.query.card_name}%`);
    }
    if (req.query.set_name) {
      whereClauses.push('set_name = ?');
      params.push(req.query.set_name);
    }
    if (req.query.card_type) {
      whereClauses.push('card_type = ?');
      params.push(req.query.card_type);
    }
    if (req.query.ink_color) {
      whereClauses.push('ink_color = ?');
      params.push(req.query.ink_color);
    }
    if (req.query.rarity) {
      whereClauses.push('rarity = ?');
      params.push(req.query.rarity);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as count FROM cards ${whereSQL}`).get(...params);
    const cards = db.prepare(
      `SELECT * FROM cards ${whereSQL} ORDER BY set_name, set_number ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      cards,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  } catch (err) {
    console.error('List cards error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /cards/:id - Get a single card
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const db = getDb();
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Get latest price if available
    const price = db.prepare(
      'SELECT * FROM price_history WHERE card_id = ? ORDER BY recorded_at DESC LIMIT 1'
    ).get(req.params.id);

    res.json({ card, price: price || null });
  } catch (err) {
    console.error('Get card error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /cards - Create a new card (admin endpoint, used by ML team)
router.post('/', authenticateToken, (req, res) => {
  try {
    const { card_name, set_name, set_number, card_type, ink_cost, image_url, rarity, ink_color } = req.body;

    if (!card_name || !set_name || !set_number) {
      return res.status(400).json({ error: 'card_name, set_name, and set_number are required' });
    }

    const db = getDb();

    // Check for duplicate
    const existing = db.prepare(
      'SELECT id FROM cards WHERE set_name = ? AND set_number = ?'
    ).get(set_name, set_number);

    if (existing) {
      return res.status(409).json({ error: 'Card already exists', existing_id: existing.id });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO cards (id, card_name, set_name, set_number, card_type, ink_cost, image_url, rarity, ink_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, card_name, set_name, set_number, card_type || null, ink_cost || null, image_url || null, rarity || null, ink_color || null);

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);

    res.status(201).json({ message: 'Card created', card });
  } catch (err) {
    console.error('Create card error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /cards/:id - Update a card
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { card_name, set_name, set_number, card_type, ink_cost, image_url, rarity, ink_color } = req.body;

    const db = getDb();
    const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Card not found' });
    }

    db.prepare(
      `UPDATE cards SET
        card_name = COALESCE(?, card_name),
        set_name = COALESCE(?, set_name),
        set_number = COALESCE(?, set_number),
        card_type = COALESCE(?, card_type),
        ink_cost = COALESCE(?, ink_cost),
        image_url = COALESCE(?, image_url),
        rarity = COALESCE(?, rarity),
        ink_color = COALESCE(?, ink_color)
       WHERE id = ?`
    ).run(
      card_name || null, set_name || null, set_number || null,
      card_type || null, ink_cost ?? null, image_url || null,
      rarity || null, ink_color || null,
      req.params.id
    );

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    res.json({ message: 'Card updated', card });
  } catch (err) {
    console.error('Update card error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /cards/:id - Delete a card
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ message: 'Card deleted' });
  } catch (err) {
    console.error('Delete card error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /cards/sets/list - Get all unique set names
router.get('/sets/list', (req, res) => {
  try {
    const db = getDb();
    const sets = db.prepare('SELECT DISTINCT set_name FROM cards ORDER BY set_name').all();
    res.json({ sets: sets.map(s => s.set_name) });
  } catch (err) {
    console.error('List sets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
