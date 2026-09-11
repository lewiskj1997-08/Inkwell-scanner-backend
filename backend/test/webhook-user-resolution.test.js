const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const {
  normalizeId,
  resolveUserForSubscription
} = require('../src/utils/webhook-user-resolution');

// Build an in-memory users table with just the columns the resolver touches.
function makeDb(rows) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      subscription_end_date TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'none'
    );
  `);
  const insert = db.prepare(
    `INSERT INTO users (id, email, username, password_hash, subscription_tier, stripe_customer_id, stripe_subscription_id)
     VALUES (?, ?, ?, 'x', ?, ?, ?)`
  );
  for (const r of rows) {
    insert.run(r.id, r.email, r.username, r.tier || 'free', r.customer || null, r.subscription || null);
  }
  return db;
}

test('normalizeId returns string ids and extracts .id from objects', () => {
  assert.strictEqual(normalizeId('cus_123'), 'cus_123');
  assert.strictEqual(normalizeId({ id: 'cus_456' }), 'cus_456');
  assert.strictEqual(normalizeId(null), null);
  assert.strictEqual(normalizeId(undefined), null);
});

test('resolveUserForSubscription: metadata user_id wins over stored ids', async () => {
  const db = makeDb([
    { id: 'user-A', email: 'a@example.com', username: 'a' },
    { id: 'user-B', email: 'b@example.com', username: 'b', customer: 'cus_B', subscription: 'sub_B' }
  ]);
  const userId = await resolveUserForSubscription(db, {
    metadataUserId: 'user-A',
    subscriptionId: 'sub_B',
    customerId: 'cus_B'
  });
  assert.strictEqual(userId, 'user-A');
});

test('resolveUserForSubscription: stored ids used when no metadata', async () => {
  const db = makeDb([
    { id: 'user-B', email: 'b@example.com', username: 'b', customer: 'cus_B', subscription: 'sub_B' }
  ]);
  const userId = await resolveUserForSubscription(db, {
    metadataUserId: null,
    subscriptionId: 'sub_B',
    customerId: null
  });
  assert.strictEqual(userId, 'user-B');
});

test('resolveUserForSubscription: matches by customer id when subscription id unknown', async () => {
  const db = makeDb([
    { id: 'user-B', email: 'b@example.com', username: 'b', customer: 'cus_B', subscription: 'sub_OLD' }
  ]);
  const userId = await resolveUserForSubscription(db, {
    metadataUserId: null,
    subscriptionId: 'sub_NEW',
    customerId: 'cus_B'
  });
  assert.strictEqual(userId, 'user-B');
});

test('resolveUserForSubscription: email fallback when no metadata or stored ids', async () => {
  const db = makeDb([
    { id: 'user-C', email: 'c@example.com', username: 'c' }
  ]);
  const userId = await resolveUserForSubscription(db, {
    metadataUserId: null,
    subscriptionId: null,
    customerId: null,
    customerEmail: 'c@example.com'
  });
  assert.strictEqual(userId, 'user-C');
});

test('resolveUserForSubscription: retrieves customer email via callback', async () => {
  const db = makeDb([
    { id: 'user-D', email: 'd@example.com', username: 'd' }
  ]);
  const getCustomerEmail = async (cid) => {
    assert.strictEqual(cid, 'cus_D');
    return 'd@example.com';
  };
  const userId = await resolveUserForSubscription(db, {
    metadataUserId: null,
    subscriptionId: null,
    customerId: 'cus_D',
    customerEmail: null
  }, getCustomerEmail);
  assert.strictEqual(userId, 'user-D');
});

test('resolveUserForSubscription: returns null when nothing matches', async () => {
  const db = makeDb([
    { id: 'user-E', email: 'e@example.com', username: 'e' }
  ]);
  const userId = await resolveUserForSubscription(db, {
    metadataUserId: 'user-ZZZ',
    subscriptionId: null,
    customerId: null,
    customerEmail: 'zzz@example.com'
  });
  assert.strictEqual(userId, null);
});
