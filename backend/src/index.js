const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, closeDb } = require('./db');
const { seedCatalogIfEmpty } = require('./catalog');

// Import routes
const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const inventoryRoutes = require('./routes/inventory');
const scanRoutes = require('./routes/scans');
const subscriptionRoutes = require('./routes/subscription');
const exportRoutes = require('./routes/export');
const priceRoutes = require('./routes/prices');
const setRoutes = require('./routes/sets');
const recognizeRoutes = require('./routes/recognize');

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook needs the RAW request body for signature verification.
// This MUST be mounted before express.json(), otherwise the JSON parser consumes
// the stream and req.body arrives as an object instead of a Buffer, breaking
// stripe.webhooks.constructEvent().
app.use('/subscription/webhook', express.raw({ type: 'application/json' }));

// Parse JSON bodies (but not raw for Stripe webhooks)
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'inkwell-scanner-backend'
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/cards', cardRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/scans', scanRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/export', exportRoutes);
app.use('/prices', priceRoutes);
app.use('/sets', setRoutes);
app.use('/recognize', recognizeRoutes);

// API documentation
app.get('/', (req, res) => {
  res.json({
    service: 'Inkwell Scanner API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /auth/register',
        login: 'POST /auth/login',
        profile: 'GET /auth/me',
        changePassword: 'PUT /auth/password'
      },
      cards: {
        list: 'GET /cards',
        get: 'GET /cards/:id',
        create: 'POST /cards',
        update: 'PUT /cards/:id',
        delete: 'DELETE /cards/:id',
        sets: 'GET /cards/sets/list'
      },
      inventory: {
        list: 'GET /inventory',
        add: 'POST /inventory',
        update: 'PUT /inventory/:id',
        remove: 'DELETE /inventory/:id',
        stats: 'GET /inventory/stats'
      },
      scans: {
        record: 'POST /scans/record',
        status: 'GET /scans/status',
        history: 'GET /scans/history'
      },
      subscription: {
        plans: 'GET /subscription/plans',
        createCheckout: 'POST /subscription/create-checkout',
        confirm: 'POST /subscription/confirm',
        cancel: 'POST /subscription/cancel',
        webhook: 'POST /subscription/webhook'
      },
      export: {
        csv: 'GET /export/csv',
        json: 'GET /export/json',
        importJson: 'POST /export/json',
        importCsv: 'POST /export/csv'
      },
      prices: {
        get: 'GET /prices/:cardId',
        search: 'GET /prices/search/:query',
        history: 'GET /prices/history/:cardId',
        refresh: 'POST /prices/refresh/:cardId'
      },
      sets: {
        list: 'GET /sets',
        get: 'GET /sets/:code',
        sync: 'POST /sets/sync',
        stats: 'GET /sets/stats'
      },
      recognize: {
        scan: 'POST /recognize (multipart image + hint)',
        search: 'POST /recognize/search (text query)',
        status: 'GET /recognize/status'
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB and start server
try {
  // Initialize database
  const db = getDb();
  console.log('Database initialized successfully');

  // Auto-seed the card catalog if the DB is empty (fresh host, e.g. Render deploy).
  // Idempotent — no-op when cards already exist.
  const seedSummary = seedCatalogIfEmpty(db);
  console.log(`Catalog: ${seedSummary}`);

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Inkwell Scanner API running on http://0.0.0.0:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API docs: http://localhost:${PORT}/`);
  });
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  closeDb();
  process.exit(0);
});

module.exports = app;
