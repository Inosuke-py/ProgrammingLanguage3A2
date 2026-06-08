import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../database/db.js';

/**
 * Auth middleware — verifies JWT from Authorization header or cookie.
 * Attaches user to req.user on success.
 */
export function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      errors: [{ code: 'AUTH_REQUIRED', message: 'Authentication required' }],
    });
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        errors: [{ code: 'TOKEN_EXPIRED', message: 'Token expired, please refresh' }],
      });
    }
    return res.status(401).json({
      success: false,
      errors: [{ code: 'INVALID_TOKEN', message: 'Invalid token' }],
    });
  }
}

/**
 * Optional auth — attaches user if token present, continues either way.
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, env.jwtSecret);
    } catch {
      // Token invalid, continue as unauthenticated
    }
  }
  next();
}

/**
 * Role guard — use after authenticate.
 * @param  {...string} roles - Allowed roles
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        errors: [{ code: 'FORBIDDEN', message: 'Insufficient permissions' }],
      });
    }
    next();
  };
}

/**
 * Generate JWT access token.
 */
export function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/**
 * Verify a raw JWT access token. Returns the decoded payload, or throws if
 * the token is invalid/expired. Useful when a route needs to peek at the
 * caller's identity without enforcing the full authenticate() guard
 * (e.g. /auth/google with an optional merge-from hint).
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/**
 * Generate JWT refresh token and store hash in DB.
 */
export async function generateRefreshToken(userId) {
  const token = jwt.sign({ id: userId, type: 'refresh' }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn });

  // Store token hash (not the raw token)
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(token).digest('hex');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt]
  );

  return token;
}

/**
 * Extract token from header or cookie.
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Check cookie
  return req.cookies?.access_token || null;
}
