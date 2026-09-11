const express = require('express');
const { getDb } = require('../db');
const { authenticateToken, requirePremium } = require('../middleware/auth');

const router = express.Router();

// GET /export/csv - Export inventory as CSV
router.get('/csv', authenticateToken, requirePremium, (req, res) => {
  try {
    const db = getDb();

    const items = db.prepare(
      `SELECT c.card_name, c.set_name, c.set_number, c.card_type, c.ink_cost,
              c.rarity, c.ink_color, c.image_url,
              ui.quantity, ui.condition, ui.is_foil
       FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ui.user_id = ?
       ORDER BY c.set_name, c.set_number ASC`
    ).all(req.user.id);

    // Generate CSV
    const headers = [
      'card_name', 'set_name', 'set_number', 'card_type', 'ink_cost',
      'rarity', 'ink_color', 'image_url', 'quantity', 'condition', 'is_foil'
    ];

    let csv = headers.join(',') + '\n';

    for (const item of items) {
      const row = headers.map(h => {
        const val = item[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inkwell_inventory_${req.user.username}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ error: 'Failed to export inventory' });
  }
});

// GET /export/json - Export inventory as JSON
router.get('/json', authenticateToken, requirePremium, (req, res) => {
  try {
    const db = getDb();

    const items = db.prepare(
      `SELECT c.id as card_id, c.card_name, c.set_name, c.set_number, c.card_type,
              c.ink_cost, c.rarity, c.ink_color, c.image_url,
              ui.quantity, ui.condition, ui.is_foil
       FROM user_inventory ui
       JOIN cards c ON ui.card_id = c.id
       WHERE ui.user_id = ?
       ORDER BY c.set_name, c.set_number ASC`
    ).all(req.user.id);

    // Get user info
    const user = db.prepare(
      'SELECT id, username, email FROM users WHERE id = ?'
    ).get(req.user.id);

    const exportData = {
      exported_at: new Date().toISOString(),
      source: 'Inkwell Scanner',
      version: '1.0.0',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      total_cards: items.reduce((sum, item) => sum + item.quantity, 0),
      unique_cards: items.length,
      inventory: items
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="inkwell_inventory_${req.user.username}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error('Export JSON error:', err);
    res.status(500).json({ error: 'Failed to export inventory' });
  }
});

// POST /import/json - Import inventory from JSON
router.post('/json', authenticateToken, requirePremium, (req, res) => {
  try {
    const { inventory } = req.body;

    if (!inventory || !Array.isArray(inventory)) {
      return res.status(400).json({ error: 'inventory array is required' });
    }

    const db = getDb();
    let imported = 0;
    let skipped = 0;
    let errors = [];

    const insertOrUpdate = db.prepare(
      `INSERT INTO user_inventory (id, user_id, card_id, quantity, condition, is_foil)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, condition, is_foil)
       DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = datetime('now')`
    );

    const findCard = db.prepare('SELECT id FROM cards WHERE set_name = ? AND set_number = ?');

    const transaction = db.transaction((items) => {
      for (const item of items) {
        try {
          // Find card by set_name + set_number
          let cardId = item.card_id;

          if (!cardId) {
            const card = findCard.get(item.set_name, item.set_number);
            if (!card) {
              skipped++;
              errors.push(`Card not found: ${item.set_name} #${item.set_number}`);
              continue;
            }
            cardId = card.id;
          } else {
            // Verify card exists
            const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
            if (!card) {
              skipped++;
              errors.push(`Card not found by ID: ${cardId}`);
              continue;
            }
          }

          const { v4: uuidv4 } = require('uuid');
          insertOrUpdate.run(
            uuidv4(),
            req.user.id,
            cardId,
            item.quantity || 1,
            item.condition || 'near_mint',
            item.is_foil ? 1 : 0
          );
          imported++;
        } catch (itemErr) {
          skipped++;
          errors.push(`Error importing item: ${itemErr.message}`);
        }
      }
    });

    transaction(inventory);

    res.json({
      message: `Import complete: ${imported} cards imported, ${skipped} skipped`,
      imported,
      skipped,
      errors: errors.slice(0, 10) // Return first 10 errors
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import inventory' });
  }
});

// POST /import/csv - Import inventory from CSV
router.post('/csv', authenticateToken, requirePremium, (req, res) => {
  try {
    const { csv_data } = req.body;

    if (!csv_data || typeof csv_data !== 'string') {
      return res.status(400).json({ error: 'csv_data string is required' });
    }

    // Parse CSV
    const lines = csv_data.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));

    // Validate required headers
    const requiredHeaders = ['card_name', 'set_name', 'set_number'];
    for (const h of requiredHeaders) {
      if (!headers.includes(h)) {
        return res.status(400).json({ error: `CSV must include '${h}' column` });
      }
    }

    const db = getDb();
    let imported = 0;
    let skipped = 0;
    let errors = [];

    const findCardByNameAndSet = db.prepare(
      'SELECT id FROM cards WHERE set_name = ? AND set_number = ?'
    );
    const findCardByName = db.prepare(
      'SELECT id FROM cards WHERE card_name = ?'
    );

    const { v4: uuidv4 } = require('uuid');

    const transaction = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (simple parser)
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            if (inQuotes && j + 1 < line.length && line[j + 1] === '"') {
              current += '"';
              j++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        try {
          // Find card
          let cardId = null;
          if (row.set_name && row.set_number) {
            const card = findCardByNameAndSet.get(row.set_name, row.set_number);
            if (card) cardId = card.id;
          }
          if (!cardId && row.card_name) {
            const card = findCardByName.get(row.card_name);
            if (card) cardId = card.id;
          }

          if (!cardId) {
            skipped++;
            errors.push(`Row ${i}: Card not found - ${row.card_name || (row.set_name + ' #' + row.set_number)}`);
            continue;
          }

          const quantity = parseInt(row.quantity) || 1;
          const condition = row.condition || 'near_mint';
          const isFoil = (row.is_foil === 'true' || row.is_foil === '1' || row.is_foil === 'yes') ? 1 : 0;

          // Check for existing
          const existing = db.prepare(
            'SELECT id, quantity FROM user_inventory WHERE user_id = ? AND card_id = ? AND condition = ? AND is_foil = ?'
          ).get(req.user.id, cardId, condition, isFoil);

          if (existing) {
            db.prepare(
              'UPDATE user_inventory SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE id = ?'
            ).run(quantity, existing.id);
          } else {
            db.prepare(
              `INSERT INTO user_inventory (id, user_id, card_id, quantity, condition, is_foil)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(uuidv4(), req.user.id, cardId, quantity, condition, isFoil);
          }
          imported++;
        } catch (rowErr) {
          skipped++;
          errors.push(`Row ${i}: ${rowErr.message}`);
        }
      }
    });

    transaction();

    res.json({
      message: `Import complete: ${imported} cards imported, ${skipped} skipped`,
      imported,
      skipped,
      errors: errors.slice(0, 10)
    });
  } catch (err) {
    console.error('CSV import error:', err);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

module.exports = router;
