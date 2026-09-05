const express = require('express');
const { getDb } = require('../db');
const { authenticateToken, generateToken } = require('../middleware/auth');
const {
  deriveEndDate,
  isPaidSession,
  tierForStatus,
  intervalForSubscription
} = require('../utils/subscription-dates');

const router = express.Router();

// Stripe SDK is conditionally loaded if STRIPE_SECRET_KEY is set
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Price IDs for subscription products (set these in env vars for production)
const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY || 'price_monthly_299';
const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY || 'price_yearly_1999';

// GET /subscription/plans - Get available plans
router.get('/plans', (req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        scans_per_month: 50,
        features: [
          'Scan up to 50 cards per month',
          'Basic inventory view',
          'Card search'
        ]
      },
      {
        id: 'premium_monthly',
        name: 'Premium Monthly',
        price: 2.99,
        currency: 'USD',
        interval: 'month',
        stripe_price_id: STRIPE_PRICE_MONTHLY,
        scans_per_month: -1,
        features: [
          'Unlimited scans',
          'Export/import inventory',
          'Deck-building integration',
          'TCGPlayer price tracking',
          'Priority support'
        ]
      },
      {
        id: 'premium_yearly',
        name: 'Premium Yearly',
        price: 19.99,
        currency: 'USD',
        interval: 'year',
        stripe_price_id: STRIPE_PRICE_YEARLY,
        scans_per_month: -1,
        features: [
          'Unlimited scans',
          'Export/import inventory',
          'Deck-building integration',
          'TCGPlayer price tracking',
          'Priority support',
          'Best value ($1.67/month)'
        ]
      }
    ]
  });
});

// POST /subscription/create-checkout - Create Stripe checkout session
router.post('/create-checkout', authenticateToken, async (req, res) => {
  try {
    const { price_id, success_url, cancel_url } = req.body;

    if (!price_id) {
      return res.status(400).json({ error: 'price_id is required' });
    }

    if (!stripe) {
      // Dev mode: simulate checkout
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

      return res.json({
        url: null,
        checkout_url: null,
        dev_mode: true,
        message: 'Stripe not configured. In dev mode, use POST /subscription/confirm to simulate upgrading.',
        session_id: 'cs_dev_' + require('crypto').randomBytes(8).toString('hex')
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      customer_email: req.user.email,
      client_reference_id: req.user.id,
      success_url: success_url || 'https://inkwell.app/subscription/success',
      cancel_url: cancel_url || 'https://inkwell.app/subscription/cancel',
      metadata: {
        user_id: req.user.id
      }
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /subscription/confirm - Dev mode: simulate upgrading
router.post('/confirm', authenticateToken, (req, res) => {
  try {
    const { plan } = req.body; // 'premium_monthly' or 'premium_yearly'

    if (!plan || !['premium_monthly', 'premium_yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Valid plan required (premium_monthly or premium_yearly)' });
    }

    const db = getDb();

    const endDate = new Date();
    if (plan === 'premium_yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const subscriptionId = 'sub_dev_' + require('crypto').randomBytes(8).toString('hex');

    db.prepare(
      `UPDATE users SET
        subscription_tier = 'premium',
        stripe_subscription_id = ?,
        subscription_end_date = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(subscriptionId, endDate.toISOString(), req.user.id);

    const user = db.prepare(
      'SELECT id, email, username, subscription_tier, subscription_end_date FROM users WHERE id = ?'
    ).get(req.user.id);

    // Generate a fresh token with the new subscription tier
    const freshToken = generateToken(user);

    res.json({
      message: 'Subscription activated',
      subscription: {
        tier: user.subscription_tier,
        end_date: user.subscription_end_date
      },
      user,
      token: freshToken
    });
  } catch (err) {
    console.error('Confirm subscription error:', err);
    res.status(500).json({ error: 'Failed to confirm subscription' });
  }
});

// POST /subscription/cancel - Cancel subscription
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (user.subscription_tier !== 'premium') {
      return res.status(400).json({ error: 'No active premium subscription' });
    }

    if (stripe && user.stripe_subscription_id && !user.stripe_subscription_id.startsWith('sub_dev_')) {
      try {
        await stripe.subscriptions.update(user.stripe_subscription_id, {
          cancel_at_period_end: true
        });
      } catch (stripeErr) {
        console.error('Stripe cancel error:', stripeErr);
      }
    }

    // Downgrade to free
    db.prepare(
      `UPDATE users SET
        subscription_tier = 'free',
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(req.user.id);

    res.json({
      message: 'Subscription cancelled. You still have access until the end of your billing period.',
      subscription: { tier: 'free' }
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /subscription/webhook - Stripe webhook handler
// Raw body parsing is handled at the app level (src/index.js) BEFORE express.json()
// so that req.body is a Buffer here for signature verification.
router.post('/webhook', async (req, res) => {
  if (!stripe) {
    return res.status(200).json({ received: true, dev_mode: true });
  }

  let event;
  const sig = req.headers['stripe-signature'];

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getDb();

  // Idempotency: Stripe retries webhook deliveries (for up to ~3 days) if we don't
  // return 2xx quickly. Dedupe by event id so re-delivered events don't double-apply.
  const alreadyProcessed = db.prepare(
    'SELECT 1 FROM processed_webhook_events WHERE event_id = ?'
  ).get(event.id);
  if (alreadyProcessed) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    await handleWebhookEvent(db, event);
  } catch (err) {
    // Return 500 so Stripe retries; do NOT mark the event processed.
    console.error('Webhook event processing failed:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  // Mark as processed only after successfully handling the event.
  db.prepare(
    'INSERT OR IGNORE INTO processed_webhook_events (event_id, event_type) VALUES (?, ?)'
  ).run(event.id, event.type);

  res.json({ received: true });
});

// Shared webhook event processing. Extracted so the handler can catch errors and
// return a 500 (triggering a Stripe retry) without marking the event as processed.
async function handleWebhookEvent(db, event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;

      // Never grant premium unless the checkout was actually paid.
      if (!isPaidSession(session)) {
        console.warn(
          `checkout.session.completed ignored: payment_status=${session.payment_status}`
        );
        break;
      }

      const userId = session.metadata?.user_id || session.client_reference_id;
      if (!userId) break;

      // Derive the end date from the actual subscription. Read the subscription's
      // current_period_end (authoritative, handles monthly AND yearly), falling back
      // to the plan interval (or 1 month) if retrieval fails.
      let endDate = null;
      if (session.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          endDate = deriveEndDate({
            currentPeriodEnd: subscription.current_period_end,
            interval: intervalForSubscription(subscription)
          });
        } catch (err) {
          // Live-Stripe note: confirm this fallback never happens in normal flow.
          console.warn('Could not retrieve subscription for end date, using 1-month fallback:', err.message);
          endDate = deriveEndDate({ interval: 'month' });
        }
      } else {
        endDate = deriveEndDate({ interval: 'month' });
      }

      db.prepare(
        `UPDATE users SET
          subscription_tier = 'premium',
          subscription_status = 'active',
          stripe_customer_id = ?,
          stripe_subscription_id = ?,
          subscription_end_date = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(session.customer, session.subscription, endDate.toISOString(), userId);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      // Match by subscription id first, then by customer id (covers the case where
      // checkout.session.completed hasn't stored the sub id yet).
      const user = db.prepare(
        `SELECT id, stripe_subscription_id, stripe_customer_id FROM users
         WHERE stripe_subscription_id = ? OR stripe_customer_id = ?`
      ).get(subscription.id, subscription.customer);

      if (!user) break;

      const endDate = deriveEndDate({
        currentPeriodEnd: subscription.current_period_end,
        interval: intervalForSubscription(subscription)
      });

      db.prepare(
        `UPDATE users SET
          subscription_tier = ?,
          subscription_status = ?,
          stripe_customer_id = ?,
          stripe_subscription_id = ?,
          subscription_end_date = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        tierForStatus(subscription.status),
        subscription.status,
        subscription.customer,
        subscription.id,
        endDate.toISOString(),
        user.id
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        // Re-activate on successful renewal/charge (clears any past_due flag).
        const endDate = new Date(
          invoice.lines?.data?.[0]?.period?.end * 1000 ||
          Date.now() + 30 * 24 * 60 * 60 * 1000
        );
        db.prepare(
          `UPDATE users SET
            subscription_tier = 'premium',
            subscription_status = 'active',
            subscription_end_date = ?,
            updated_at = datetime('now')
           WHERE stripe_subscription_id = ?`
        ).run(endDate.toISOString(), subscriptionId);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        // Documented behavior: keep premium access until the current period ends,
        // but flag past_due so support/ops can follow up.
        db.prepare(
          `UPDATE users SET
            subscription_status = 'past_due',
            updated_at = datetime('now')
           WHERE stripe_subscription_id = ?`
        ).run(subscriptionId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      db.prepare(
        `UPDATE users SET
          subscription_tier = 'free',
          subscription_status = 'canceled',
          stripe_subscription_id = NULL,
          updated_at = datetime('now')
         WHERE stripe_subscription_id = ?`
      ).run(subscription.id);
      break;
    }
  }
}

module.exports = router;
