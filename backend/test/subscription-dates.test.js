const { test } = require('node:test');
const assert = require('node:assert');
const {
  deriveEndDate,
  isPaidSession,
  tierForStatus,
  intervalForSubscription
} = require('../src/utils/subscription-dates');

test('deriveEndDate uses current_period_end when provided', () => {
  const now = new Date('2026-08-28T00:00:00Z');
  const end = deriveEndDate({ currentPeriodEnd: 1800000000, interval: 'month', now });
  assert.strictEqual(end.toISOString(), new Date(1800000000 * 1000).toISOString());
});

test('deriveEndDate falls back to +1 month for month interval', () => {
  const now = new Date('2026-08-28T00:00:00Z');
  const end = deriveEndDate({ interval: 'month', now });
  assert.strictEqual(end.toISOString(), new Date('2026-09-28T00:00:00Z').toISOString());
});

test('deriveEndDate falls back to +1 year for year interval', () => {
  const now = new Date('2026-08-28T00:00:00Z');
  const end = deriveEndDate({ interval: 'year', now });
  assert.strictEqual(end.toISOString(), new Date('2027-08-28T00:00:00Z').toISOString());
});

test('deriveEndDate defaults to +1 month for unknown interval', () => {
  const now = new Date('2026-08-28T00:00:00Z');
  const end = deriveEndDate({ interval: 'bogus', now });
  assert.strictEqual(end.toISOString(), new Date('2026-09-28T00:00:00Z').toISOString());
});

test('deriveEndDate defaults to +1 month when no interval given', () => {
  const now = new Date('2026-08-28T00:00:00Z');
  const end = deriveEndDate({ now });
  assert.strictEqual(end.toISOString(), new Date('2026-09-28T00:00:00Z').toISOString());
});

test('deriveEndDate +1 week for week interval', () => {
  const now = new Date('2026-08-28T00:00:00Z');
  const end = deriveEndDate({ interval: 'week', now });
  assert.strictEqual(end.toISOString(), new Date('2026-09-04T00:00:00Z').toISOString());
});

test('isPaidSession true only for payment_status=paid', () => {
  assert.strictEqual(isPaidSession({ payment_status: 'paid' }), true);
  assert.strictEqual(isPaidSession({ payment_status: 'unpaid' }), false);
  assert.strictEqual(isPaidSession({ payment_status: 'no_payment_required' }), false);
  assert.strictEqual(isPaidSession({}), false);
  assert.strictEqual(isPaidSession(null), false);
});

test('tierForStatus keeps premium for active/trialing/past_due/unpaid', () => {
  for (const s of ['active', 'trialing', 'past_due', 'unpaid', 'unknown']) {
    assert.strictEqual(tierForStatus(s), 'premium', `status ${s} should stay premium`);
  }
});

test('tierForStatus downgrades only on terminal statuses', () => {
  for (const s of ['canceled', 'incomplete', 'incomplete_expired']) {
    assert.strictEqual(tierForStatus(s), 'free', `status ${s} should downgrade`);
  }
});

test('intervalForSubscription reads items.data[0].plan.interval then plan.interval', () => {
  assert.strictEqual(
    intervalForSubscription({ items: { data: [{ plan: { interval: 'year' } }] } }),
    'year'
  );
  assert.strictEqual(intervalForSubscription({ plan: { interval: 'month' } }), 'month');
  assert.strictEqual(intervalForSubscription({}), 'month');
  assert.strictEqual(intervalForSubscription(null), 'month');
});
