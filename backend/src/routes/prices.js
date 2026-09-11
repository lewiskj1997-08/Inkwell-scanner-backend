const express = require('express');
const { getDb } = require('../db');
const { authenticateToken, requirePremium } = require('../middleware/auth');

const router = express.Router();

// TCGPlayer API configuration
const TCGPLAYER_API_URL = process.env.TCGPLAYER_API_URL || 'https://api.tcgplayer.com';
const TCGPLAYER_PUBLIC_KEY = process.env.TCGPLAYER_PUBLIC_KEY || '';
const TCGPLAYER_PRIVATE_KEY = process.env.TCGPLAYER_PRIVATE_KEY || '';

let tcgplayerToken = null;
let tokenExpiry = null;

/**
 * Get TCGPlayer bearer token
 */
async function getTcgPlayerToken() {
  if (tcgplayerToken && tokenExpiry && Date.now() < tokenExpiry) {
    return tcgplayerToken;
  }

  if (!TCGPLAYER_PUBLIC_KEY || !TCGPLAYER_PRIVATE_KEY) {
    return null;
  }

  try {
    const https = require('https');

    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify({
        grant_type: 'client_credentials',
        client_id: TCGPLAYER_PUBLIC_KEY,
        client_secret: TCGPLAYER_PRIVATE_KEY
      });

      const req = https.request(`${TCGPLAYER_API_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Failed to parse token response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });

    tcgplayerToken = response.access_token;
    tokenExpiry = Date.now() + (response.expires_in - 60) * 1000; // Refresh 1 min early
    return tcgplayerToken;
  } catch (err) {
    console.error('Failed to get TCGPlayer token:', err.message);
    return null;
  }
}

/**
 * Search for a card on TCGPlayer
 */
async function searchCard(cardName, setName) {
  const token = await getTcgPlayerToken();
  if (!token) return { mock: true, message: 'TCGPlayer API not configured' };

  try {
    const https = require('https');

    const searchTerm = setName ? `${cardName} ${setName}` : cardName;

    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify({
        filters: [
          { name: 'ProductName', values: [searchTerm] },
          { name: 'GroupId', values: [1] } // Trading Cards group
        ],
        offset: 0,
        limit: 10,
        sort: 'ProductName'
      });

      const req = https.request(`${TCGPLAYER_API_URL}/catalog/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Failed to parse search response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });

    return response;
  } catch (err) {
    console.error('TCGPlayer search error:', err.message);
    return { error: err.message };
  }
}

/**
 * Get market prices for a product
 */
async function getProductPrices(productId) {
  const token = await getTcgPlayerToken();
  if (!token) return { mock: true, message: 'TCGPlayer API not configured' };

  try {
    const https = require('https');

    const response = await new Promise((resolve, reject) => {
      const req = https.request(
        `${TCGPLAYER_API_URL}/pricing/product/${productId}`,
        { headers: { 'Authorization': `Bearer ${token}` } },
        (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error('Failed to parse price response'));
            }
          });
        }
      );

      req.on('error', reject);
      req.end();
    });

    return response;
  } catch (err) {
    console.error('TCGPlayer price error:', err.message);
    return { error: err.message };
  }
}

// GET /prices/:cardId - Get price for a specific card
router.get('/:cardId', authenticateToken, requirePremium, async (req, res) => {
  try {
    const db = getDb();
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Get cached price from our DB first
    const cachedPrice = db.prepare(
      'SELECT * FROM price_history WHERE card_id = ? ORDER BY recorded_at DESC LIMIT 1'
    ).get(req.params.cardId);

    // If price was cached within the last 24 hours, return it
    if (cachedPrice) {
      const cachedTime = new Date(cachedPrice.recorded_at).getTime();
      const now = Date.now();
      const hoursSinceUpdate = (now - cachedTime) / (1000 * 60 * 60);

      if (hoursSinceUpdate < 24) {
        return res.json({
          card_id: req.params.cardId,
          card_name: card.card_name,
          price: cachedPrice.price,
          source: cachedPrice.source,
          cached_at: cachedPrice.recorded_at,
          from_cache: true
        });
      }
    }

    // Try to fetch live price from TCGPlayer
    if (TCGPLAYER_PUBLIC_KEY && TCGPLAYER_PRIVATE_KEY) {
      try {
        const searchResult = await searchCard(card.card_name, card.set_name);

        if (searchResult.results && searchResult.results.length > 0) {
          const product = searchResult.results[0];
          const prices = await getProductPrices(product.productId);

          if (prices.results && prices.results.length > 0) {
            const marketPrice = prices.results[0].marketPrice;

            if (marketPrice) {
              // Save to price history
              const { v4: uuidv4 } = require('uuid');
              const priceId = uuidv4();
              db.prepare(
                'INSERT INTO price_history (id, card_id, price, source) VALUES (?, ?, ?, ?)'
              ).run(priceId, req.params.cardId, marketPrice, 'tcgplayer');

              return res.json({
                card_id: req.params.cardId,
                card_name: card.card_name,
                price: marketPrice,
                source: 'tcgplayer',
                cached_at: new Date().toISOString(),
                from_cache: false
              });
            }
          }
        }
      } catch (apiErr) {
        console.error('TCGPlayer API error:', apiErr.message);
      }
    }

    // Fallback: return cached price even if stale, or null
    if (cachedPrice) {
      return res.json({
        card_id: req.params.cardId,
        card_name: card.card_name,
        price: cachedPrice.price,
        source: cachedPrice.source,
        cached_at: cachedPrice.recorded_at,
        from_cache: true,
        note: 'Using cached price (API unavailable)'
      });
    }

    res.json({
      card_id: req.params.cardId,
      card_name: card.card_name,
      price: null,
      source: null,
      message: 'No price data available'
    });
  } catch (err) {
    console.error('Get price error:', err);
    res.status(500).json({ error: 'Failed to get price data' });
  }
});

// GET /prices/search/:query - Search and get prices
router.get('/search/:query', authenticateToken, requirePremium, async (req, res) => {
  try {
    if (!TCGPLAYER_PUBLIC_KEY || !TCGPLAYER_PRIVATE_KEY) {
      return res.json({
        mock: true,
        message: 'TCGPlayer API not configured. Set TCGPLAYER_PUBLIC_KEY and TCGPLAYER_PRIVATE_KEY env vars.',
        results: []
      });
    }

    const result = await searchCard(req.params.query, req.query.set_name);

    res.json(result);
  } catch (err) {
    console.error('Search prices error:', err);
    res.status(500).json({ error: 'Failed to search prices' });
  }
});

// GET /prices/history/:cardId - Get price history for a card
router.get('/history/:cardId', authenticateToken, requirePremium, (req, res) => {
  try {
    const db = getDb();
    const history = db.prepare(
      'SELECT * FROM price_history WHERE card_id = ? ORDER BY recorded_at DESC LIMIT 30'
    ).all(req.params.cardId);

    res.json({ card_id: req.params.cardId, history });
  } catch (err) {
    console.error('Price history error:', err);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

// POST /prices/refresh/:cardId - Force refresh price for a card
router.post('/refresh/:cardId', authenticateToken, requirePremium, async (req, res) => {
  try {
    const db = getDb();
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (!TCGPLAYER_PUBLIC_KEY || !TCGPLAYER_PRIVATE_KEY) {
      return res.json({
        mock: true,
        message: 'TCGPlayer API not configured',
        price: null
      });
    }

    try {
      const searchResult = await searchCard(card.card_name, card.set_name);

      if (searchResult.results && searchResult.results.length > 0) {
        const product = searchResult.results[0];
        const prices = await getProductPrices(product.productId);

        if (prices.results && prices.results.length > 0) {
          const marketPrice = prices.results[0].marketPrice;

          if (marketPrice) {
            const { v4: uuidv4 } = require('uuid');
            const priceId = uuidv4();
            db.prepare(
              'INSERT INTO price_history (id, card_id, price, source) VALUES (?, ?, ?, ?)'
            ).run(priceId, req.params.cardId, marketPrice, 'tcgplayer');

            return res.json({
              card_id: req.params.cardId,
              card_name: card.card_name,
              price: marketPrice,
              source: 'tcgplayer',
              refreshed_at: new Date().toISOString()
            });
          }
        }
      }
    } catch (apiErr) {
      console.error('TCGPlayer API error:', apiErr.message);
    }

    res.json({
      card_id: req.params.cardId,
      card_name: card.card_name,
      price: null,
      message: 'Could not retrieve price from TCGPlayer'
    });
  } catch (err) {
    console.error('Refresh price error:', err);
    res.status(500).json({ error: 'Failed to refresh price' });
  }
});

module.exports = router;
