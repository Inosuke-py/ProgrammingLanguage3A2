import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import * as userService from './user.service.js';
import * as quizService from '../quiz/quiz.service.js';

const router = Router();

/**
 * GET /users/me/stats
 * Get current user's dashboard stats.
 */
router.get('/me/stats', authenticate, async (req, res, next) => {
  try {
    const stats = await userService.getUserStats(req.user.id);
    res.json({ success: true, data: { stats } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/me/attempts
 * Get current user's quiz history.
 */
router.get('/me/attempts', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const attempts = await quizService.getUserAttempts(
      req.user.id,
      parseInt(page, 10),
      Math.min(parseInt(limit, 10) || 20, 50)
    );
    res.json({ success: true, data: { attempts } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/leaderboard
 * Global leaderboard — top users by XP.
 *
 * Auth required: prevents anonymous scraping of real names + avatar URLs +
 * stable user ids. Sanitizes the response to a small public-safe shape.
 */
router.get('/leaderboard', authenticate, async (req, res, next) => {
  try {
    const leaderboard = await userService.getGlobalLeaderboard(10);
    // Strip user ids, full names, and full-resolution avatar URLs from the
    // response. We only return what's needed to render a ranking row:
    // first name + last initial + xp/level/streak. Avatar omitted because
    // it's a static Google CDN URL that's effectively a tracking beacon for
    // scrapers.
    const sanitized = leaderboard.map((u) => {
      const parts = (u.display_name || '').trim().split(/\s+/);
      const first = parts[0] || 'User';
      const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : '';
      return {
        name: lastInitial ? `${first} ${lastInitial}` : first,
        xp: u.xp,
        level: u.level,
        streak: u.streak,
      };
    });
    res.json({ success: true, data: { leaderboard: sanitized } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /users/me
 * Update current user's profile.
 */
router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.user.id, req.body);
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
});

// =============================================
// AI PROVIDER KEYS — per-user, encrypted at rest
// =============================================

const ALLOWED_PROVIDERS = ['mistral', 'gemini', 'openai-compatible'];

/**
 * GET /users/me/ai-keys
 * Lists which providers the user has saved keys for, with safe metadata
 * (last 4 characters + optional model). Plaintext keys are NEVER returned.
 */
router.get('/me/ai-keys', authenticate, async (req, res, next) => {
  try {
    const keys = await userService.listUserAIKeys(req.user.id);
    res.json({ success: true, data: { keys } });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /users/me/ai-keys/:provider
 * Save (or replace) the user's API key for a provider.
 *
 * Validates the key by making a tiny generation request to the provider
 * before storing — if the test fails, we reject with a clear error so
 * the user doesn't save a bad key and find out later.
 *
 * Body: { apiKey, model? }
 */
router.put('/me/ai-keys/:provider', authenticate, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        success: false,
        errors: [{ code: 'UNSUPPORTED_PROVIDER', message: `Unsupported provider: ${provider}` }],
      });
    }

    const { apiKey, model, baseUrl } = req.body || {};
    if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return res.status(400).json({
        success: false,
        errors: [{ code: 'INVALID_KEY', message: 'API key looks too short to be valid.' }],
      });
    }

    // openai-compatible needs both baseUrl and model.
    if (provider === 'openai-compatible') {
      if (typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl)) {
        return res.status(400).json({
          success: false,
          errors: [{ code: 'INVALID_BASE_URL', message: 'Base URL must be a valid HTTP(S) URL.' }],
        });
      }
      if (typeof model !== 'string' || !model.trim()) {
        return res.status(400).json({
          success: false,
          errors: [{ code: 'MODEL_REQUIRED', message: 'Model id is required (e.g. "openai/gpt-4o-mini" for OpenRouter).' }],
        });
      }
    }

    // Test the key with a tiny generation request before storing.
    // Lazy import to avoid a circular reference (ai → users → ai).
    const { testProviderKey } = await import('../ai/ai.service.js');
    const testResult = await testProviderKey(provider, apiKey.trim(), model?.trim(), baseUrl?.trim());
    if (!testResult.ok) {
      return res.status(400).json({
        success: false,
        errors: [{
          code: 'KEY_TEST_FAILED',
          message: `Could not validate key with ${provider}: ${testResult.error}`,
        }],
      });
    }

    const saved = await userService.saveUserAIKey(req.user.id, provider, apiKey, model, baseUrl);
    res.json({ success: true, data: { provider, ...saved } });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /users/me/ai-keys/:provider
 * Remove the user's saved key for a provider.
 */
router.delete('/me/ai-keys/:provider', authenticate, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        success: false,
        errors: [{ code: 'UNSUPPORTED_PROVIDER', message: `Unsupported provider: ${provider}` }],
      });
    }
    await userService.deleteUserAIKey(req.user.id, provider);
    res.json({ success: true, data: { provider, removed: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
