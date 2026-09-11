// Catalog seeding for the backend.
//
// On a fresh host (e.g. Render), the SQLite DB file is empty and must be populated
// with the card catalog before the API is useful. This module:
//   1. Looks for a bundled catalog at data/cards_db.json (self-contained on the host).
//   2. Falls back to the ML service's cards_db.json if the repo is checked out as the
//      full monorepo (../ml-service/cards_db.json).
//   3. Falls back to the small built-in subset in builtin-cards.js.
//
// seedCatalogIfEmpty(db) is idempotent: it only inserts when the `cards` table is empty.

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { CARD_DATA, SET_METADATA } = require('./builtin-cards');

// Candidate catalog JSON paths, in priority order.
function catalogPaths() {
  return [
    path.join(__dirname, '..', 'data', 'cards_db.json'),          // bundled with backend
    path.join(__dirname, '..', '..', 'ml-service', 'cards_db.json') // full monorepo checkout
  ];
}

// Load the catalog JSON (or null if none found).
function loadCatalogJson() {
  for (const p of catalogPaths()) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (err) {
        console.warn(`Catalog at ${p} exists but failed to parse: ${err.message}`);
      }
    }
  }
  return null;
}

function buildTags(card) {
  const tags = [];
  if (card.type === 'Character') tags.push('character');
  else if (card.type === 'Action') tags.push('action');
  else if (card.type === 'Item') tags.push('item');
  tags.push(card.ink_color?.toLowerCase() || '');
  tags.push(card.rarity?.toLowerCase().replace(/\s+/g, '-') || '');
  return tags.filter(Boolean).join(',');
}

// Populate cards + set_metadata from a catalog object of the form
// { sets: [ { name, code, release_date, cards: [ { name, number, type, ... } ] } ] }.
function seedFromCatalogJson(db, data) {
  const insertCard = db.prepare(`
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
  const tx = db.transaction(() => {
    for (const set of data.sets || []) {
      let cardCount = 0;
      for (const card of set.cards || []) {
        insertCard.run(
          uuidv4(),
          card.name,
          set.name,
          set.code,
          card.number,
          card.type || null,
          card.ink_cost || null,
          card.image_url || null,
          card.rarity || null,
          card.ink_color || null,
          buildTags(card)
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
    }
  });
  tx();
  return totalImported;
}

// Populate from the built-in subset.
function seedFromBuiltin(db) {
  const insertCard = db.prepare(`
    INSERT INTO cards (id, card_name, set_name, set_code, set_number, card_type, ink_cost, image_url, rarity, ink_color, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSet = db.prepare(`
    INSERT INTO set_metadata (id, name, code, release_date, total_cards, card_count)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const SEED_IMAGE_BASE = 'https://lorcana.gg/cards';
  let totalImported = 0;
  const tx = db.transaction(() => {
    for (const set of SET_METADATA) {
      insertSet.run(uuidv4(), set.name, set.code, set.release_date, set.total_cards);
    }
    for (const card of CARD_DATA) {
      const slug = card.card_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const imageUrl = card.image_url || `${SEED_IMAGE_BASE}/${slug}.webp`;
      insertCard.run(
        uuidv4(), card.card_name, card.set_name, card.set_code, card.set_number,
        card.card_type, card.ink_cost, imageUrl, card.rarity, card.ink_color, card.tags
      );
      totalImported++;
    }
  });
  tx();

  // Update card counts in set_metadata.
  db.prepare(`
    UPDATE set_metadata SET card_count = (
      SELECT COUNT(*) FROM cards WHERE cards.set_name = set_metadata.name
    )
  `).run();

  return totalImported;
}

/**
 * Seed the catalog if the cards table is empty. Idempotent and safe to call on every
 * boot. Returns a short summary string.
 */
function seedCatalogIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM cards').get().count;
  if (count > 0) {
    return `catalog already seeded (${count} cards)`;
  }

  const json = loadCatalogJson();
  let imported = 0;
  let source = '';

  if (json) {
    imported = seedFromCatalogJson(db, json);
    source = 'bundled cards_db.json';
  } else {
    imported = seedFromBuiltin(db);
    source = 'built-in fallback';
  }

  return `seeded ${imported} cards from ${source}`;
}

module.exports = { seedCatalogIfEmpty, loadCatalogJson };
