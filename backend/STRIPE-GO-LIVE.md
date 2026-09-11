# Stripe Go-Live Runbook — Inkwell Scanner

**Status:** Backend is code-complete and dev-mode verified. This document tells the owner
exactly what to do to turn on real Stripe payments. **No real keys go in source code — they go
in Secrets (environment variables) only.**

---

## ⏸️ Current progress — paused at webhook step (updated 2026-08-29)

**Owner has saved 3 of 4 required secrets.**
- ✅ `STRIPE_SECRET_KEY` — saved (standard account, `sk_...`)
- ✅ `STRIPE_PRICE_MONTHLY` — saved ($2.99/month, `price_...`)
- ✅ `STRIPE_PRICE_YEARLY` — saved ($19.99/year, `price_...`)
- ⬜ `STRIPE_WEBHOOK_SECRET` — **NOT yet** (blocked)

**Why `STRIPE_WEBHOOK_SECRET` is paused:** the owner does not yet have a public server / hosting plan,
so there is no public HTTPS endpoint for Stripe to deliver webhooks to. The backend currently runs
only locally (no public address). Wiring the webhook now would point at a URL that cannot receive events.

**To resume, the next step is:** host the backend at a public HTTPS URL (VPS, hosting platform, or dev
tunnel). Then: Stripe → Developers → Webhooks → Add endpoint at `https://<backend-host>/subscription/webhook`
(subscribe to `checkout.session.completed`, `customer.subscription.created/.updated/.deleted`,
`invoice.payment_succeeded/failed`), copy the `whsec_...` signing secret, save it as `STRIPE_WEBHOOK_SECRET`,
restart the backend, and confirm `/subscription/plans` shows the real `price_...` IDs (not the dev-mode
`price_monthly_299` / `price_yearly_1999`) and that `POST /subscription/webhook` no longer returns
`dev_mode: true`.

No work is wasted — the three saved secrets remain correct and the backend subscription flow is fully
code-complete + dev-mode verified (see the checklist in §5).

---

## 0. What the backend expects (secret names)

The backend reads four environment variables. Set these in the platform **Secrets** manager
(not in any file you commit):

| Secret name | What it is | Where to get it |
|-------------|-----------|-----------------|
| `STRIPE_SECRET_KEY` | Server-side API key (starts `sk_live_…`) | Stripe Dashboard → Developers → API keys → "Secret key" |
| `STRIPE_PRICE_MONTHLY` | Monthly subscription price ID (starts `price_…`) | Stripe Dashboard → Product catalog (see §2) |
| `STRIPE_PRICE_YEARLY` | Yearly subscription price ID (starts `price_…`) | Stripe Dashboard → Product catalog (see §2) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (starts `whsec_…`) | Stripe Dashboard → Developers → Webhooks (see §3) |

> ⚠️ Use the **live** keys (`sk_live_…`) only when you're ready to accept real money.
> For testing use `sk_test_…` and test-mode prices/webhooks.

---

## 1. Create / find your Stripe account + secret key

1. Go to <https://dashboard.stripe.com/register> and create an account (or log in).
2. Switch to **test mode** or **live mode** using the toggle in the top-right
   (test mode uses `sk_test_…`, live uses `sk_live_…`).
3. Navigate to **Developers → API keys**.
4. Copy the **Secret key** (`sk_live_…` / `sk_test_…`).
5. Store it as the `STRIPE_SECRET_KEY` secret.

---

## 2. Create the two subscription prices

The app sells **two** recurring prices. You need their `price_…` IDs.

1. In the Stripe Dashboard, go to **Product catalog → Add product** (or **Products**).
2. Create a product named **"Inkwell Scanner Premium"**.
3. Under pricing choose **Recurring**, billing period **Monthly**, price **$2.99 USD**.
   - After saving, copy the resulting **price ID** (`price_…`) → this is `STRIPE_PRICE_MONTHLY`.
4. Add a second price on the same product with billing period **Yearly**, price **$19.99 USD**.
   - Copy its **price ID** (`price_…`) → this is `STRIPE_PRICE_YEARLY`.

> Prices must match what the `/subscription/plans` endpoint advertises:
> Monthly $2.99 (interval `month`) and Yearly $19.99 (interval `year`).

---

## 3. Register the webhook endpoint + get the signing secret

The backend's webhook handler is at:

```
POST /subscription/webhook
```

It listens for these Stripe events (already implemented):
- `checkout.session.completed`
- `invoice.payment_succeeded`
- `customer.subscription.deleted`

1. In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Enter the endpoint URL as `https://<your-public-backend-host>/subscription/webhook`.
3. Under "Events to send" (or "Select events"), enable:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. After creating the endpoint, Stripe shows a **Signing secret** (`whsec_…`).
   Copy it → this is `STRIPE_WEBHOOK_SECRET`.

---

## 4. Restart the backend

After all four secrets are stored:
1. Restart the backend service (the code loads `stripe` and the price IDs at boot).
2. Verify: `POST /subscription/webhook` no longer returns `dev_mode: true`
   (it will now verify signatures), and `GET /subscription/plans` shows the real
   `stripe_price_id` values instead of `price_monthly_299` / `price_yearly_1999`.

---

## 5. Sanity checklist

- [ ] `STRIPE_SECRET_KEY` stored (live or test key)
- [ ] `STRIPE_PRICE_MONTHLY` = a real `price_…` with interval `month`, $2.99
- [ ] `STRIPE_PRICE_YEARLY` = a real `price_…` with interval `year`, $19.99
- [ ] `STRIPE_WEBHOOK_SECRET` = the `whsec_…` from the webhook endpoint
- [ ] Webhook endpoint URL points at `/subscription/webhook`
- [ ] Backend restarted after storing secrets
- [ ] Test purchase in **test mode** completes without real money
- [ ] Switch to **live mode** only after test-mode checkout + webhook round-trip succeeds

---

# Webhook audit findings (for the engineering team)

> **Update (2026-08-28):** All items below have now been fixed in `src/routes/subscription.js`,
> `src/index.js`, and `src/db.js`, with pure date/tier logic extracted to
> `src/utils/subscription-dates.js` and unit-tested in `test/subscription-dates.test.js`
> (`node --test`). The list below is retained for historical context; the "Fix" notes describe what
> was implemented.

The webhook handler in `src/routes/subscription.js` was functional but had **live-readiness gaps**
before real money flows. Remediation list (in priority order) — all now resolved:

1. **`checkout.session.completed` hardcoded a 1-month end date** and ignored the yearly
   interval. **FIXED:** the handler now retrieves `session.subscription` and uses its
   `current_period_end` (authoritative for monthly AND yearly), falling back to the plan interval
   (or 1 month) only if retrieval fails.

2. **`checkout.session.completed` gave access before payment was actually collected.**
   **FIXED:** the handler now bails out unless `session.payment_status === 'paid'`.

3. **Missing `customer.subscription.updated` handler.** **FIXED:** added a shared handler for
   `customer.subscription.created` and `customer.subscription.updated` that updates
   `subscription_end_date` from `current_period_end` and derives the tier from `subscription.status`.

4. **`invoice.payment_succeeded` lacked idempotency.** **FIXED:** added a
   `processed_webhook_events` table and a dedupe-by-event-id guard at the top of the webhook
   handler, so re-delivered events (Stripe retries for up to 3 days) are skipped.

5. **No `invoice.payment_failed` / past-due handling.** **FIXED:** added `invoice.payment_failed`
   handling that flags `subscription_status = 'past_due'` (keeps premium access until the period
   ends, per documented behavior), and `customer.subscription.deleted` now also sets
   `subscription_status = 'canceled'`. A `subscription_status` column was added to `users`.

6. **Webhook middleware ordering.** The prior note claimed the raw-body parsing was correct, but it
   was **actually broken**: the global `express.json()` in `index.js` ran *before* the route-level
   `express.raw()`, so the webhook received a parsed object instead of a Buffer, which would break
   `stripe.webhooks.constructEvent()` in production. **FIXED:** `express.raw({type:'application/json'})`
   is now mounted at app level for `/subscription/webhook` *before* `express.json()`, and the
   route-level raw parser was removed. Verified empirically that `req.body` is a Buffer.

7. **`session.metadata?.user_id || session.client_reference_id` fallback** — retained (harmless,
   `client_reference_id` is the reliable source).

8. **`customer.subscription.deleted` leaves `stripe_customer_id`** — retained (harmless hygiene item).
