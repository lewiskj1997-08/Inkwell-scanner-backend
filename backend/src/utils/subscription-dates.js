// Pure, dependency-free helpers for Stripe subscription date/tier logic.
// Extracted so the end-date math is unit-testable without a live Stripe key.

const ACTIVE_STATUSES = ['active', 'trialing'];
const PAST_DUE_STATUSES = ['past_due', 'unpaid'];
// Statuses that should never grant (or keep) premium access.
const TERMINAL_STATUSES = ['canceled', 'incomplete', 'incomplete_expired'];

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Derive a subscription end date.
 *
 * @param {Object} opts
 * @param {number}  [opts.currentPeriodEnd] Stripe `current_period_end` (unix seconds) — authoritative.
 * @param {string}  [opts.interval]        Stripe plan interval ('month' | 'year' | 'week'). Fallback only.
 * @param {Date}    [opts.now]             Reference date for the fallback (injectable for tests).
 * @returns {Date}
 */
function deriveEndDate({ currentPeriodEnd, interval, now }) {
  const base = now || new Date();

  if (
    typeof currentPeriodEnd === 'number' &&
    Number.isFinite(currentPeriodEnd) &&
    currentPeriodEnd > 0
  ) {
    return new Date(currentPeriodEnd * 1000);
  }

  if (interval === 'year') return addYears(base, 1);
  if (interval === 'week') return addDays(base, 7);
  // month, or unknown → default to one month
  return addMonths(base, 1);
}

/**
 * A checkout session should only grant premium if payment actually completed.
 * @param {Object} session Stripe Checkout Session object.
 * @returns {boolean}
 */
function isPaidSession(session) {
  return !!(session && session.payment_status === 'paid');
}

/**
 * Map a Stripe subscription status to our internal tier.
 * past_due/unpaid keep premium access until the end of the current billing period
 * (documented behavior), and active/trialing are premium. Only explicit terminal
 * statuses downgrade to free. Unknown statuses are treated as premium (safe default:
 * never silently strip access on a status we don't recognize).
 * @param {string} status
 * @returns {'premium'|'free'}
 */
function tierForStatus(status) {
  if (TERMINAL_STATUSES.includes(status)) return 'free';
  return 'premium';
}

/**
 * Extract the plan interval from a Stripe subscription object.
 * @param {Object} subscription
 * @returns {string}
 */
function intervalForSubscription(subscription) {
  return (
    subscription?.items?.data?.[0]?.plan?.interval ||
    subscription?.plan?.interval ||
    'month'
  );
}

module.exports = {
  deriveEndDate,
  isPaidSession,
  tierForStatus,
  intervalForSubscription,
  ACTIVE_STATUSES,
  PAST_DUE_STATUSES,
  TERMINAL_STATUSES
};
