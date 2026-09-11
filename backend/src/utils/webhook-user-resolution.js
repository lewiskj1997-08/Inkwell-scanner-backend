// Pure user-resolution helpers for Stripe webhook events.
// Extracted (like subscription-dates.js) so the matching-priority logic is
// unit-testable without a live Stripe key.
//
// These helpers answer one question for a subscription/invoice webhook event:
// "which of our users does this Stripe object belong to?" The order matters and
// fixes a real bug: checkout.session.completed can fire with payment_status !== 'paid'
// (async card auth), so the paid-branch never stores stripe_customer_id /
// stripe_subscription_id on the user. When that happens, the subscription/invoice
// events that follow must still be able to find the user.

/**
 * Normalize a Stripe "id-or-object" reference to a plain id string.
 * Webhook payloads normally send related objects as id strings, but if `expand`
 * is ever used they can arrive as objects. Handle both.
 * @param {string|{id:string}|null|undefined} value
 * @returns {string|null}
 */
function normalizeId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

/**
 * Resolve a user for a subscription/invoice webhook event, in priority order:
 *
 *   1. `metadataUserId` — subscription.metadata.user_id (new checkouts carry the
 *      app's user id on the subscription itself).
 *   2. stored `stripe_subscription_id` / `stripe_customer_id` on the users table
 *      (the fast path once checkout.session.completed has persisted them).
 *   3. email fallback — `customerEmail`, or (when absent) the customer's email via
 *      the injected `getCustomerEmail` callback (e.g. stripe.customers.retrieve).
 *      This recovers an already-created live subscription whose customer email
 *      matches the user's email.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Object} opts
 * @param {string} [opts.metadataUserId]
 * @param {string|{id:string}} [opts.subscriptionId]
 * @param {string|{id:string}} [opts.customerId]
 * @param {string} [opts.customerEmail]
 * @param {(customerId: string) => Promise<string|null>} [getCustomerEmail]
 * @returns {Promise<string|null>} the matching user id, or null
 */
async function resolveUserForSubscription(
  db,
  { metadataUserId, subscriptionId, customerId, customerEmail },
  getCustomerEmail
) {
  const subId = normalizeId(subscriptionId);
  const custId = normalizeId(customerId);

  // 1. subscription metadata user_id
  if (metadataUserId) {
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(String(metadataUserId));
    if (row) return row.id;
  }

  // 2. stored Stripe ids
  if (subId || custId) {
    const row = db.prepare(
      'SELECT id FROM users WHERE stripe_subscription_id = ? OR stripe_customer_id = ?'
    ).get(subId, custId);
    if (row) return row.id;
  }

  // 3. email fallback
  let email = customerEmail;
  if (!email && custId && typeof getCustomerEmail === 'function') {
    try {
      email = await getCustomerEmail(custId);
    } catch (err) {
      email = null;
    }
  }
  if (email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (row) return row.id;
  }

  return null;
}

module.exports = { normalizeId, resolveUserForSubscription };
