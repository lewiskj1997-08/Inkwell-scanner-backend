const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'inkwell.db');

let db;

function getDb() {
  if (!db) {
    // Ensure the data directory exists (e.g. a fresh Render host has no data/ dir).
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_end_date TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      card_name TEXT NOT NULL,
      set_name TEXT NOT NULL,
      set_code TEXT,
      set_number TEXT NOT NULL,
      card_type TEXT,
      ink_cost INTEGER,
      image_url TEXT,
      rarity TEXT,
      ink_color TEXT,
      tags TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(set_name, set_number)
    );

    CREATE TABLE IF NOT EXISTS set_metadata (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      code TEXT NOT NULL,
      release_date TEXT,
      total_cards INTEGER,
      card_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_inventory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      condition TEXT DEFAULT 'near_mint',
      is_foil INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      UNIQUE(user_id, card_id, condition, is_foil)
    );

    CREATE TABLE IF NOT EXISTS scan_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scan_date TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      price REAL NOT NULL,
      source TEXT DEFAULT 'tcgplayer',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON user_inventory(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_inventory_card_id ON user_inventory(card_id);
    CREATE INDEX IF NOT EXISTS idx_scan_usage_user_id ON scan_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_scan_usage_date ON scan_usage(scan_date);
    CREATE INDEX IF NOT EXISTS idx_price_history_card_id ON price_history(card_id);
    CREATE INDEX IF NOT EXISTS idx_cards_set_code ON cards(set_code);
    CREATE INDEX IF NOT EXISTS idx_cards_ink_color ON cards(ink_color);
    CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
    CREATE INDEX IF NOT EXISTS idx_cards_card_type ON cards(card_type);
  `);

  // Idempotent migrations for columns added after the initial release.
  // (CREATE TABLE IF NOT EXISTS does not add columns to existing tables.)
  migrate(db);
}

function migrate(db) {
  const columns = db.prepare(`PRAGMA table_info(users)`).all();
  const hasSubscriptionStatus = columns.some((c) => c.name === 'subscription_status');
  if (!hasSubscriptionStatus) {
    db.exec(`ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'none'`);
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
