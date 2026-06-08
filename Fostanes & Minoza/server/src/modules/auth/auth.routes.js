import { Router } from 'express';
import { z } from 'zod';
import { handleGoogleCallback, handleGuestLogin, handleTokenRefresh, revokeAllTokens, getGoogleAuthUrl, parseOAuthState } from './auth.service.js';
import { authenticate, verifyAccessToken } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { env } from '../../config/env.js';
import { auditLog } from '../../utils/audit.js';

const router = Router();

/**
 * GET /auth/google
 * Redirect to Google OAuth consent screen.
 *
 * Optional: ?merge_from=<guestUserId> — only honored when the requester
 * currently holds a valid access token for THAT same guest user. This
 * prevents a malicious caller from hijacking someone else's guest history
 * just by guessing a user id.
 */
router.get('/google', (req, res) => {
  let mergeFromGuestId = null;
  const requested = req.query.merge_from;
  if (requested && typeof requested === 'string') {
    try {
      const token = req.cookies?.access_token;
      if (token) {
        const payload = verifyAccessToken(token);
        if (payload?.id === requested && payload?.role === 'guest') {
          mergeFromGuestId = requested;
        }
      }
    } catch {
      // Bad/expired token — silently drop the merge hint and continue.
    }
  }

  const url = getGoogleAuthUrl(mergeFromGuestId ? { mergeFromGuestId } : undefined);
  res.redirect(url);
});

/**
 * GET /auth/google/callback
 * Google redirects here after consent.
 * Exchanges code for tokens, sets cookies, redirects to client.
 */
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code) {
      return res.redirect(`${env.clientUrl}/?error=no_code`);
    }

    const { mergeFromGuestId } = parseOAuthState(state);

    const { user, accessToken, refreshToken } = await handleGoogleCallback(code, {
      mergeFromGuestId: mergeFromGuestId || undefined,
    });

    auditLog('LOGIN_GOOGLE', { userId: user.id, email: user.email, ip: req.ip });
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: !env.isDev,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 min
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: !env.isDev,
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to client with success
    res.redirect(`${env.clientUrl}/auth/callback?success=true`);
  } catch (err) {
    auditLog('LOGIN_GOOGLE_FAILED', { error: err.message, ip: req.ip });
    next(err);
  }
});

/**
 * POST /auth/guest
 * Create a guest session.
 *
 * Body validation: displayName is optional. When provided, it's a string,
 * 1–80 chars (the service further sanitizes control chars and trims).
 * The 80-char cap matches the client-side welcome-gate limit. We
 * surface a validation error rather than silently truncate so abusive
 * payloads don't reach the DB.
 */
const guestSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});
router.post('/guest', validate(guestSchema), async (req, res, next) => {
  try {
    const { displayName } = req.validated;
    const { user, accessToken, refreshToken } = await handleGuestLogin(displayName);

    auditLog('LOGIN_GUEST', { userId: user.id, ip: req.ip });

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: !env.isDev,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: !env.isDev,
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/refresh
 * Rotate refresh token and issue new access token.
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshTokenValue = req.cookies?.refresh_token;
    if (!refreshTokenValue) {
      return res.status(401).json({
        success: false,
        errors: [{ code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided' }],
      });
    }

    const { accessToken, refreshToken } = await handleTokenRefresh(refreshTokenValue);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: !env.isDev,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: !env.isDev,
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: { message: 'Token refreshed' } });
  } catch (err) {
    auditLog('REFRESH_FAILED', { error: err.message, ip: req.ip });
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.status(401).json({
      success: false,
      errors: [{ code: 'REFRESH_FAILED', message: err.message }],
    });
  }
});

/**
 * POST /auth/logout
 * Clear cookies and revoke all refresh tokens.
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await revokeAllTokens(req.user.id);
    auditLog('LOGOUT', { userId: req.user.id, ip: req.ip });
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 * Get current authenticated user.
 */
router.get('/me', authenticate, async (req, res) => {
  const { findById } = await import('../users/user.service.js');
  const user = await findById(req.user.id);
  if (user && user.is_active === false) {
    return res.status(403).json({ success: false, errors: [{ code: 'ACCOUNT_DEACTIVATED', message: 'Your account has been deactivated' }] });
  }
  res.json({ success: true, data: { user: sanitizeUser(user) } });
});

/**
 * Strip sensitive fields from user object before sending to the client.
 *
 * Fields removed:
 *   - google_id           : OAuth subject id, not needed by the client
 *   - ai_provider_keys    : encrypted envelopes (ciphertext, iv, tag).
 *                           Even though the AES key is server-side, defense
 *                           in depth: never ship encrypted secrets to the
 *                           browser. The user.routes.js GET /me/ai-keys
 *                           endpoint surfaces only safe metadata
 *                           (hasKey, last4, model, baseUrl).
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { google_id, ai_provider_keys, ...safe } = user;
  return safe;
}

export default router;
