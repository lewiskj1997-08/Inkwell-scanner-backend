const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'inkwell-scanner-dev-secret-change-in-prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      subscription_tier: user.subscription_tier
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requirePremium(req, res, next) {
  // Check against DB for the actual tier (JWT may be stale)
  const { getDb } = require('../db');
  const db = getDb();
  const user = db.prepare('SELECT subscription_tier FROM users WHERE id = ?').get(req.user.id);
  const tier = user ? user.subscription_tier : 'free';

  if (tier !== 'premium') {
    return res.status(403).json({
      error: 'Premium subscription required',
      code: 'PREMIUM_REQUIRED'
    });
  }
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Token invalid, continue without auth
    }
  }
  next();
}

module.exports = {
  generateToken,
  authenticateToken,
  requirePremium,
  optionalAuth,
  JWT_SECRET
};
