# Inkwell Scanner — Backend API Reference

**Base URL (dev):** `http://localhost:8001`
**ML recognition service:** `http://localhost:8000` (FastAPI — OCR + ORB feature matching)
**Auth:** JWT Bearer tokens. Most write endpoints require `Authorization: Bearer <token>`.
**Content type:** JSON (`application/json`) except `/recognize` which is `multipart/form-data`.

---

## Quick reference

| Area | Method & Path | Auth | Notes |
|------|---------------|------|-------|
| Health | `GET /health` | — | service heartbeat |
| Docs | `GET /` | — | lists all endpoints |
| Register | `POST /auth/register` | — | returns user + JWT |
| Login | `POST /auth/login` | — | returns JWT |
| Profile | `GET /auth/me` | ✅ | current user |
| Change password | `PUT /auth/password` | ✅ | |
| Cards list | `GET /cards` | — | paginated, filterable |
| Card detail | `GET /cards/:id` | — | |
| Card create | `POST /cards` | ✅ | admin/seed |
| Card update | `PUT /cards/:id` | ✅ | |
| Card delete | `DELETE /cards/:id` | ✅ | |
| Sets list | `GET /sets` | — | |
| Set detail | `GET /sets/:code` | — | includes cards |
| Sets stats | `GET /sets/stats` | — | |
| Sets sync | `POST /sets/sync` | ✅ | re-import from ML DB |
| Recognize (image) | `POST /recognize` | optional | multipart image + hint |
| Recognize (search) | `POST /recognize/search` | — | text-only query |
| Recognize status | `GET /recognize/status` | — | OCR availability |
| Inventory list | `GET /inventory` | ✅ | |
| Inventory add | `POST /inventory` | ✅ | |
| Inventory update | `PUT /inventory/:id` | ✅ | |
| Inventory remove | `DELETE /inventory/:id` | ✅ | |
| Inventory stats | `GET /inventory/stats` | ✅ | |
| Scan record | `POST /scans/record` | ✅ | enforces 50/month free quota |
| Scan status | `GET /scans/status` | ✅ | quota remaining |
| Scan history | `GET /scans/history` | ✅ | paginated |
| Plans | `GET /subscription/plans` | — | free + premium tiers |
| Checkout | `POST /subscription/create-checkout` | ✅ | Stripe |
| Confirm | `POST /subscription/confirm` | ✅ | **dev-mode** instant upgrade |
| Cancel | `POST /subscription/cancel` | ✅ | |
| Webhook | `POST /subscription/webhook` | — | Stripe callback |
| Export CSV | `GET /export/csv` | ✅ premium | |
| Export JSON | `GET /export/json` | ✅ premium | |
| Import JSON | `POST /export/json` | ✅ premium | |
| Import CSV | `POST /export/csv` | ✅ premium | |
| Price get | `GET /prices/:cardId` | ✅ premium | TCGPlayer |
| Price search | `GET /prices/search/:query` | ✅ premium | |
| Price history | `GET /prices/history/:cardId` | ✅ premium | |
| Price refresh | `POST /prices/refresh/:cardId` | ✅ premium | |

---

## Auth

### Register
```
POST /auth/register
{"email":"user@example.com","username":"collector1","password":"SecurePass!123"}
```
→ `201` `{"message":"User registered successfully","user":{...},"token":"<jwt>"}`

### Login
```
POST /auth/login
{"email":"user@example.com","password":"SecurePass!123"}
```
→ `200` `{"token":"<jwt>","user":{...}}`

All authenticated calls: `Authorization: Bearer <jwt>`.

---

## Cards

```
GET /cards?page=1&limit=50&set_code=TFC&card_type=Character&ink_color=Amber&rarity=Legendary&search=stitch
```
→ `200`
```json
{
  "cards": [
    {
      "id": "a51c260e-...",
      "card_name": "Stitch - Rock Star",
      "set_name": "The First Chapter",
      "set_code": "TFC",
      "set_number": "2",
      "card_type": "Character",
      "ink_cost": 5,
      "ink_color": "Amber",
      "rarity": "Legendary",
      "image_url": "https://lorcana-api.com/cards/tfc/2.jpg"
    }
  ],
  "pagination": {"page":1,"limit":50,"total":155,"totalPages":4}
}
```

Supported filters (all optional): `page`, `limit`, `search`, `set_code`, `set_name`,
`card_type`, `ink_color`, `rarity`, `ink_cost`.

---

## Recognize (scan a card)

The Android camera flow calls **one** endpoint with the image bytes.

### `POST /recognize` — image recognition
`Content-Type: multipart/form-data`
Fields:
- `file` — the image (JPEG/PNG/WebP, ≤ 20 MB)
- `hint` — optional text hint (e.g. "mickey") used as a fallback and to narrow results

The backend forwards the image to the ML service (`POST http://localhost:8000/recognize`),
which runs OCR + ORB feature matching. On a confident match the response is:

```json
{
  "success": true,
  "method": "ml_recognition",
  "card": { "success": true, "card_name": "Mickey Mouse - Wayward Sorcerer", "confidence": 0.95, "method": "ocr_name_match", "ocr_extracted": {...} },
  "card_name": "Mickey Mouse - Wayward Sorcerer",
  "set_name": "The First Chapter",
  "set_code": "TFC",
  "set_number": "1",
  "confidence": 0.95,
  "db_match": { "id": "...", "card_name": "...", "set_code": "TFC", ... }
}
```

On low confidence (or ML service down) it falls back to a text search over the local card DB:
```json
{
  "success": true,
  "method": "text_search",
  "matches": [ { ...card rows... } ],
  "total_matches": 3,
  "ml_service": { "available": true }
}
```

### `POST /recognize/search` — text-only search (no image)
```json
{"query":"stitch","set_code":"TFC","card_type":"Character","ink_color":"Amber","rarity":"Legendary","limit":20}
```

### `GET /recognize/status`
```json
{"status":"ok","mode":"full","cards_available":155,"ocr_available":true,
 "ml_service":{"status":"ok","cards_in_db":155,"sets_in_db":5}}
```

---

## Scans & quota

Free tier = **50 scans/month** (resets on the 1st). Premium = unlimited.

### `POST /scans/record` (auth)
Called after each successful scan. Enforces quota.
- Free under limit → `200` `{"allowed":true,"scans_used":1,"scans_remaining":49,"scans_limit":50,"tier":"free"}`
- Free at limit → `403` `{"allowed":false,"code":"SCAN_LIMIT_REACHED", ...}`
- Premium → `200` `{"allowed":true,"scans_remaining":-1,"tier":"premium"}`

### `GET /scans/status` (auth)
Current month usage + remaining.

---

## Inventory (auth)

```
GET /inventory                                  → list user's cards + quantities
POST /inventory {"card_id":"...","quantity":1}  → add
PUT /inventory/:id {"quantity":4}               → update
DELETE /inventory/:id                           → remove
GET /inventory/stats                            → totals by set/color/rarity
```

---

## Subscription

Plans:
- `free` — $0, 50 scans/month
- `premium_monthly` — $2.99/mo, unlimited scans, export/import, price tracking
- `premium_yearly` — $19.99/yr

### Dev-mode instant upgrade (no Stripe)
```
POST /subscription/confirm   (auth)
{"plan":"premium_monthly"}   or  {"plan":"premium_yearly"}
```
→ `200` with a fresh JWT (tier claim updated to `premium`) and `subscription_end_date`.
Use this for Android QA. Production uses `create-checkout` + Stripe webhook.

---

## Export / Import (premium only)

```
GET  /export/json                → full collection as JSON download
GET  /export/csv                 → full collection as CSV download
POST /export/json  { ... }       → import collection JSON
POST /export/csv   { ... }       → import collection CSV
```

---

## Prices (premium only, TCGPlayer)

```
GET  /prices/:cardId             → current price
GET  /prices/search/:query       → search TCGPlayer
GET  /prices/history/:cardId     → price history
POST /prices/refresh/:cardId     → refresh from TCGPlayer
```
Returns mock data when no TCGPlayer API key is configured.

---

## Debug / test user (for Android QA)

| Field | Value |
|-------|-------|
| email | `debug@inkwell.test` |
| username | `debuguser` |
| password | `debugpass123` |
| tier | `premium` (upgraded via dev-mode confirm) |

Login to get a JWT, or register a fresh user via `POST /auth/register`.

---

## Environment

- Backend listens on `0.0.0.0:8001` (override with `PORT`, note the platform exports `PORT=80`,
  so start explicitly: `PORT=8001 node src/index.js`).
- ML service listens on `0.0.0.0:8000`. Backend discovers it via `ML_SERVICE_URL`
  (default `http://localhost:8000`).
- SQLite dev DB at `/home/team/shared/backend/data/inkwell.db`.
