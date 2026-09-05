#!/usr/bin/env node
/**
 * Import script: reads cards from the ML service's cards_db.json
 * and populates the backend database, including set metadata.
 *
 * Usage: node src/import-ml-cards.js
 */

const { getDb, closeDb } = require('./db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const ML_CARDS_DB = path.join(__dirname, '..', '..', 'ml-service', 'cards_db.json');

console.log('=== Inkwell Scanner - ML Card Database Import ===\n');

// Check if ML cards file exists
if (!fs.existsSync(ML_CARDS_DB)) {
  console.error(`ML card database not found at: ${ML_CARDS_DB}`);
  console.log('Falling back to built-in seed data only.');
  process.exit(0);
}

const mlData = JSON.parse(fs.readFileSync(ML_CARDS_DB, 'utf-8'));
console.log(`Found ML card database with ${mlData.sets.length} sets\n`);

const db = getDb();

// Get existing card count
const existingCount = db.prepare('SELECT COUNT(*) as count FROM cards').get().count;
console.log(`Current cards in DB: ${existingCount}`);

// Clear existing cards and set metadata for clean import
// We use a transaction to re-import everything
const importTransaction = db.transaction(() => {
  // Delete existing sets metadata and cards (keep user data)
  db.prepare('DELETE FROM set_metadata').run();
  db.prepare('DELETE FROM price_history').run();

  // Cards that are in inventory should be kept - let's just UPSERT
  const upsertCard = db.prepare(`
    INSERT INTO cards (id, card_name, set_name, set_code, set_number, card_type, ink_cost, image_url, rarity, ink_color, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(set_name, set_number) DO UPDATE SET
      card_name = excluded.card_name,
      set_code = excluded.set_code,
      card_type = excluded.card_type,
      ink_cost = excluded.ink_cost,
      image_url = excluded.image_url,
      rarity = excluded.rarity,
      ink_color = excluded.ink_color,
      tags = excluded.tags
  `);

  const insertSet = db.prepare(`
    INSERT INTO set_metadata (id, name, code, release_date, total_cards, card_count)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      code = excluded.code,
      release_date = excluded.release_date,
      total_cards = excluded.total_cards,
      card_count = excluded.card_count,
      updated_at = datetime('now')
  `);

  let totalImported = 0;

  for (const set of mlData.sets) {
    let cardCount = 0;

    for (const card of set.cards) {
      const cardId = uuidv4();

      // Build tags based on card type
      const tags = [];
      if (card.type === 'Character') tags.push('character');
      else if (card.type === 'Action') tags.push('action');
      else if (card.type === 'Item') tags.push('item');
      tags.push(card.ink_color?.toLowerCase() || '');
      tags.push(card.rarity?.toLowerCase().replace(/\s+/g, '-') || '');

      upsertCard.run(
        cardId,
        card.name,
        set.name,
        set.code,
        card.number,
        card.type || null,
        card.ink_cost || null,
        card.image_url || null,
        card.rarity || null,
        card.ink_color || null,
        tags.filter(Boolean).join(',')
      );

      cardCount++;
      totalImported++;
    }

    insertSet.run(
      uuidv4(),
      set.name,
      set.code,
      set.release_date || null,
      cardCount,
      cardCount
    );

    console.log(`  ${set.name} (${set.code}): ${cardCount} cards imported`);
  }

  return totalImported;
});

const imported = importTransaction();
console.log(`\n✓ Imported ${imported} cards across ${mlData.sets.length} sets`);

const totalCount = db.prepare('SELECT COUNT(*) as count FROM cards').get().count;
const setCount = db.prepare('SELECT COUNT(*) as count FROM set_metadata').get().count;
console.log(`Total cards in DB: ${totalCount}`);
console.log(`Total sets in DB: ${setCount}`);

closeDb();
console.log('\nImport complete!');
