# Deploy the Backend to Render — Owner Runbook

This walks you from a GitHub repo to a live public backend on Render (free tier), then
wires Stripe webhooks so subscriptions go live. **No real money moves until you switch
Stripe to live mode** — test everything in Stripe test mode first.

Estimated time: ~10–15 minutes.

---

## What the backend needs

- **Node 20+** (pinned via `backend/.node-version`).
- Binds to `process.env.PORT` (Render injects this automatically).
- A writable SQLite file under `backend/data/` — **auto-created and auto-seeded** with the
  155-card catalog on first boot. No manual DB setup required.
- Four secrets (from Stripe), set as Render environment variables — **never in the repo**.

| Secret name | What it is |
|-------------|-----------|
| `STRIPE_SECRET_KEY` | Stripe server-side key (`sk_test_…` for testing, `sk_live_…` for real) |
| `STRIPE_PRICE_MONTHLY` | `price_…` for $2.99/month |
| `STRIPE_PRICE_YEARLY` | `price_…` for $19.99/year |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` signing secret (obtained in step 6 below) |

---

## Step 1 — Push the code to GitHub (if not already done)

The backend lives in a `backend/` subdirectory of the repo, with `render.yaml` at the repo
root (the repo may also contain the Android app, ML service, and website). Push the whole
repo to GitHub.

> The `render.yaml` Blueprint at the repo root tells Render to build only the `backend/`
> directory (`rootDir: backend`), so the other folders are ignored for this service.

## Step 2 — Create the Render service

Either way works:

**Option A — Blueprint (recommended, uses `render.yaml`):**
1. Log in at <https://dashboard.render.com>.
2. Click **New → Blueprint**.
3. Connect your GitHub account and pick the repo.
4. Render reads `render.yaml` at the repo root and creates the web service automatically
   (it sets `rootDir: backend`, so only that directory is built).

> Note: `render.yaml` sets `rootDir: backend`, so Render builds only the `backend/`
> directory even though the repo may also contain the Android app, ML service, and website.

**Option B — New Web Service (manual):**
1. **New → Web Service**, connect GitHub, pick the repo.
2. Set **Root Directory** = `backend`.
3. Runtime = **Node**; Build Command = `npm install`; Start Command = `npm start`.
4. Choose the **Free** plan.

## Step 3 — Set the environment variables

In the Render dashboard → your service → **Environment**:

1. Add the four Stripe variables (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`,
   `STRIPE_PRICE_YEARLY`, `STRIPE_WEBHOOK_SECRET`).
   - **For `STRIPE_WEBHOOK_SECRET`, you can add it later** (after step 6) — the backend
     runs fine without it in dev-mode (webhook returns `dev_mode: true`).
2. Add a `JWT_SECRET` (any long random string) for signing auth tokens. (If omitted, a
   dev default is used — set it for production.)
3. **Save Changes** and let the service redeploy.

## Step 4 — Get your public URL

Your backend is now live at:

```
https://<your-service-name>.onrender.com
```

Check it works by opening in a browser:

```
https://<your-service-name>.onrender.com/health
```

→ should return `{"status":"ok", ...}`.

Also verify the catalog auto-seeded:

```
https://<your-service-name>.onrender.com/cards?limit=5
```

→ should return card objects. If it's empty, see the troubleshooting note at the bottom.

## Step 5 — Verify the subscription plans expose the real price IDs

```
https://<your-service-name>.onrender.com/subscription/plans
```

The `stripe_price_id` fields should show your real `price_…` IDs (not the dev-mode
`price_monthly_299` / `price_yearly_1999`). If they still show dev IDs, the Stripe env
vars weren't picked up — confirm they're saved and the service was redeployed.

## Step 6 — Wire the Stripe webhook

From `STRIPE-GO-LIVE.md` §3:

1. In Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL:
   ```
   https://<your-service-name>.onrender.com/subscription/webhook
   ```
3. Under "Events to send", enable:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Create the endpoint, then copy the **Signing secret** (`whsec_…`).
5. Back in Render → your service → **Environment**, set
   `STRIPE_WEBHOOK_SECRET` = that `whsec_…` value. **Save Changes** (triggers redeploy).

## Step 7 — Verify the webhook is live

After redeploy:

```
POST https://<your-service-name>.onrender.com/subscription/webhook
```

with no signature should return a **400** ("Webhook Error") rather than
`{"dev_mode":true}` — that confirms the handler is now verifying signatures.

---

## Step 8 — Test in Stripe test mode, then go live

1. Keep Stripe in **test mode** (`sk_test_…` key, test-mode price IDs).
2. Run a test checkout through `POST /subscription/create-checkout` and confirm premium
   is granted after payment (via the webhook).
3. Only after a full test-mode round-trip succeeds, switch to **live mode**: use
   `sk_live_…`, live `price_…` IDs, and a live webhook signing secret.

---

## Troubleshooting

- **Cards are empty after deploy** — the auto-seed runs on boot only when the `cards`
  table is empty. If a previous deploy left an empty-but-initialized DB, trigger a manual
  seed: in the Render shell, run `npm run seed`. (The seed is idempotent.)
- **SQLite resets on redeploy** — Render's free tier uses an ephemeral filesystem; the
  DB file is not guaranteed to persist across redeploys. This is fine for launch/dev.
  For durable production data, switch to a managed Postgres (out of scope for this step).
- **Health check fails** — confirm the service built (`npm install` succeeded) and the
  Start Command is `npm start`.

---

## Files added for this deploy

- `render.yaml` — Render Blueprint at the repo root (single Node web service, `rootDir: backend`).
- `backend/.node-version` — pins Node 20.
- `backend/.gitignore` — excludes `node_modules/`, local DB files, and `.env*`.
- `backend/src/catalog.js` — self-contained auto-seed logic (bundled 155-card catalog).
- `backend/src/builtin-cards.js` — small fallback card subset (used only if no catalog JSON).
- `backend/data/cards_db.json` — the bundled 155-card catalog (copied from the ML service).
- `backend/src/index.js` / `backend/src/db.js` — auto-seed on boot + create `data/` dir.
