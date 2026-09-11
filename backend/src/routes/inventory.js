const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticateToken, requirePremium } = require('../middleware/auth');

const router = express.Router();

// GET /inventory - Get user's inventory
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    // Build query with optional filters
    let whereClauses = ['ui.user_id = ?'];
    let params = [req.user.id];

    if (req.query.card_name) {
      whereClauses.push('c.card_name LIKE ?');
      params.push(`%${req.query.card_name}%`);
    }
    if (req.query.set_name) {
      whereClauses.push('c.set_name = ?');
      params.push(req.query.set_name);
    }
    if (req.query.card_type) {
      whereClauses.push('c.card_type = ?');
      params.push(req.query.card_type);
    }
    if (req.query.ink_color) {
      whereClauses.push('c.ink_color = ?');
      params.push(req.query.ink_color);
    }

    const whereSQL = whereClauses.join(' AND ');

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ${whereSQL}`
    ).get(...params);

    const items = db.prepare(
      `SELECT ui.id as inventory_id, ui.quantity, ui.condition, ui.is_foil, ui.added_at, ui.updated_at,
              c.id as card_id, c.card_name, c.set_name, c.set_number, c.card_type, c.ink_cost, c.image_url, c.rarity, c.ink_color
       FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ${whereSQL}
       ORDER BY c.set_name, c.set_number ASC
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      inventory: items,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /inventory - Add card to inventory (or increment quantity)
router.post('/', authenticateToken, (req, res) => {
  try {
    const { card_id, quantity, condition, is_foil } = req.body;

    if (!card_id) {
      return res.status(400).json({ error: 'card_id is required' });
    }

    const addQuantity = parseInt(quantity) || 1;
    const addCondition = condition || 'near_mint';
    const addFoil = is_foil ? 1 : 0;

    const db = getDb();

    // Verify card exists
    const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(card_id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Check if already in inventory
    const existing = db.prepare(
      'SELECT id, quantity FROM user_inventory WHERE user_id = ? AND card_id = ? AND condition = ? AND is_foil = ?'
    ).get(req.user.id, card_id, addCondition, addFoil);

    if (existing) {
      db.prepare(
        `UPDATE user_inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`
      ).run(addQuantity, existing.id);
    } else {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO user_inventory (id, user_id, card_id, quantity, condition, is_foil)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, req.user.id, card_id, addQuantity, addCondition, addFoil);
    }

    // Fetch updated inventory entry
    const entry = db.prepare(
      `SELECT ui.*, c.card_name, c.set_name, c.set_number, c.image_url
       FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ui.user_id = ? AND ui.card_id = ? AND ui.condition = ? AND ui.is_foil = ?`
    ).get(req.user.id, card_id, addCondition, addFoil);

    res.status(201).json({ message: 'Card added to inventory', entry });
  } catch (err) {
    console.error('Add to inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /inventory/:id - Update inventory entry
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { quantity, condition, is_foil } = req.body;
    const db = getDb();

    const entry = db.prepare(
      'SELECT * FROM user_inventory WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!entry) {
      return res.status(404).json({ error: 'Inventory entry not found' });
    }

    db.prepare(
      `UPDATE user_inventory SET
        quantity = COALESCE(?, quantity),
        condition = COALESCE(?, condition),
        is_foil = COALESCE(?, is_foil),
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      quantity || null, condition || null,
      is_foil !== undefined ? (is_foil ? 1 : 0) : null,
      req.params.id
    );

    const updated = db.prepare(
      `SELECT ui.*, c.card_name, c.set_name, c.set_number, c.image_url
       FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ui.id = ?`
    ).get(req.params.id);

    res.json({ message: 'Inventory updated', entry: updated });
  } catch (err) {
    console.error('Update inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /inventory/:id - Remove from inventory
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM user_inventory WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Inventory entry not found' });
    }

    res.json({ message: 'Card removed from inventory' });
  } catch (err) {
    console.error('Delete inventory error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /inventory/stats - Get inventory summary stats
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const stats = db.prepare(
      `SELECT
         COUNT(DISTINCT c.id) as unique_cards,
         SUM(ui.quantity) as total_cards,
         COUNT(DISTINCT c.set_name) as sets_owned
       FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ui.user_id = ?`
    ).get(req.user.id);

    res.json(stats);
  } catch (err) {
    console.error('Inventory stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
