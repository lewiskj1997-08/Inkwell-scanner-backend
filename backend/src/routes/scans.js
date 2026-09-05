const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Get the user's actual subscription tier from the database.
 * This is more reliable than the JWT claim which may be stale.
 */
function getUserTier(userId) {
  const db = getDb();
  const user = db.prepare('SELECT subscription_tier FROM users WHERE id = ?').get(userId);
  return user ? user.subscription_tier : 'free';
}

// POST /scans/record - Record a scan (checks quota)
router.post('/record', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const actualTier = getUserTier(req.user.id);

    // Premium users have unlimited scans
    if (actualTier === 'premium') {
      const id = uuidv4();
      db.prepare('INSERT INTO scan_usage (id, user_id) VALUES (?, ?)').run(id, req.user.id);
      return res.json({
        allowed: true,
        scans_used: null,
        scans_remaining: -1,
        tier: 'premium'
      });
    }

    // Count scans this month for free users
    const scanCount = db.prepare(
      `SELECT COUNT(*) as count FROM scan_usage
       WHERE user_id = ? AND scan_date >= datetime('now', 'start of month')`
    ).get(req.user.id);

    const scansUsed = scanCount.count;
    const MAX_FREE_SCANS = 50;

    if (scansUsed >= MAX_FREE_SCANS) {
      return res.status(403).json({
        allowed: false,
        scans_used: scansUsed,
        scans_remaining: 0,
        scans_limit: MAX_FREE_SCANS,
        tier: 'free',
        error: 'Scan limit reached. Upgrade to premium for unlimited scans.',
        code: 'SCAN_LIMIT_REACHED'
      });
    }

    // Record the scan
    const id = uuidv4();
    db.prepare('INSERT INTO scan_usage (id, user_id) VALUES (?, ?)').run(id, req.user.id);

    res.json({
      allowed: true,
      scans_used: scansUsed + 1,
      scans_remaining: MAX_FREE_SCANS - (scansUsed + 1),
      scans_limit: MAX_FREE_SCANS,
      tier: 'free'
    });
  } catch (err) {
    console.error('Record scan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /scans/status - Get current scan usage
router.get('/status', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const actualTier = getUserTier(req.user.id);
    const MAX_FREE_SCANS = 50;

    const scanCount = db.prepare(
      `SELECT COUNT(*) as count FROM scan_usage
       WHERE user_id = ? AND scan_date >= datetime('now', 'start of month')`
    ).get(req.user.id);

    if (actualTier === 'premium') {
      return res.json({
        tier: 'premium',
        scans_used_this_month: scanCount.count,
        scans_remaining: -1,
        scans_limit: -1
      });
    }

    res.json({
      tier: 'free',
      scans_used_this_month: scanCount.count,
      scans_remaining: MAX_FREE_SCANS - scanCount.count,
      scans_limit: MAX_FREE_SCANS
    });
  } catch (err) {
    console.error('Scan status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /scans/history - Get scan history
router.get('/history', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM scan_usage WHERE user_id = ?'
    ).get(req.user.id);

    const scans = db.prepare(
      `SELECT * FROM scan_usage
       WHERE user_id = ?
       ORDER BY scan_date DESC
       LIMIT ? OFFSET ?`
    ).all(req.user.id, limit, offset);

    res.json({
      scans,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  } catch (err) {
    console.error('Scan history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
