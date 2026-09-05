const express = require('express');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /sets - List all sets with metadata
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const sets = db.prepare(
      'SELECT * FROM set_metadata ORDER BY release_date ASC'
    ).all();

    res.json({ sets });
  } catch (err) {
    console.error('List sets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sets/stats - Get overall collection stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as total_cards,
        COUNT(DISTINCT c.set_name) as total_sets,
        COUNT(DISTINCT c.ink_color) as total_ink_colors,
        COUNT(DISTINCT c.rarity) as total_rarities,
        COUNT(DISTINCT c.card_type) as total_card_types,
        (SELECT COUNT(*) FROM user_inventory) as total_inventory_entries,
        (SELECT COALESCE(SUM(quantity), 0) FROM user_inventory) as total_cards_owned,
        (SELECT COUNT(DISTINCT user_id) FROM scan_usage WHERE scan_date >= datetime('now', 'start of month')) as active_scanners_this_month
      FROM cards c
    `).get();

    res.json(stats);
  } catch (err) {
    console.error('Collection stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sets/:code - Get a specific set by code
router.get('/:code', (req, res) => {
  try {
    const db = getDb();
    const set = db.prepare(
      'SELECT * FROM set_metadata WHERE code = ? OR name = ?'
    ).get(req.params.code, req.params.code);

    if (!set) {
      return res.status(404).json({ error: 'Set not found' });
    }

    // Get cards in this set
    const cards = db.prepare(
      'SELECT * FROM cards WHERE set_name = ? OR set_code = ? ORDER BY CAST(set_number AS INTEGER) ASC'
    ).all(set.name, req.params.code);

    res.json({ set, cards });
  } catch (err) {
    console.error('Get set error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /sets/sync - Sync set metadata and card counts
router.post('/sync', authenticateToken, (req, res) => {
  try {
    const db = getDb();

    // Update card counts for all sets
    const updateResult = db.prepare(`
      UPDATE set_metadata SET card_count = (
        SELECT COUNT(*) FROM cards WHERE cards.set_name = set_metadata.name
      ), updated_at = datetime('now')
    `).run();

    // Find sets that have cards but no metadata entry
    const missingSets = db.prepare(`
      SELECT DISTINCT set_name FROM cards c
      WHERE NOT EXISTS (SELECT 1 FROM set_metadata s WHERE s.name = c.set_name)
    `).all();

    const sets = db.prepare('SELECT * FROM set_metadata ORDER BY release_date ASC').all();

    res.json({
      message: 'Sync complete',
      sets_updated: updateResult.changes,
      missing_set_metadata: missingSets.map(s => s.set_name),
      sets
    });
  } catch (err) {
    console.error('Sync sets error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sets/stats - Get overall collection stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as total_cards,
        COUNT(DISTINCT c.set_name) as total_sets,
        COUNT(DISTINCT c.ink_color) as total_ink_colors,
        COUNT(DISTINCT c.rarity) as total_rarities,
        COUNT(DISTINCT c.card_type) as total_card_types,
        (SELECT COUNT(*) FROM user_inventory) as total_inventory_entries,
        (SELECT COALESCE(SUM(quantity), 0) FROM user_inventory) as total_cards_owned,
        (SELECT COUNT(DISTINCT user_id) FROM scan_usage WHERE scan_date >= datetime('now', 'start of month')) as active_scanners_this_month
      FROM cards c
    `).get();

    res.json(stats);
  } catch (err) {
    console.error('Collection stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
