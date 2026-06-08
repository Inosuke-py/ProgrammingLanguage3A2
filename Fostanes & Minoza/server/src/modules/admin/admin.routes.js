import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as adminService from './admin.service.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireRole('admin'));

// Overview stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await adminService.getOverviewStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// User growth trends
router.get('/users/growth', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await adminService.getUserGrowth(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// All users (paginated). Supports ?search and ?role=all|guest|student|teacher|admin.
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const role = req.query.role || 'all';
    const data = await adminService.getAllUsers(page, limit, search, role);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Activate/Deactivate user
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { active } = req.body;
    const targetId = req.params.id;

    // Block self-deactivation — admins shouldn't be able to lock themselves
    // out by accident.
    if (active === false && targetId === req.user.id) {
      return res.status(400).json({
        success: false,
        errors: [{ code: 'CANNOT_DEACTIVATE_SELF', message: 'You cannot deactivate your own account.' }],
      });
    }

    // Block admin-on-admin deactivation. If you really need to revoke
    // another admin, demote them in the database directly.
    if (active === false) {
      const target = await adminService.findUserById(targetId);
      if (target?.role === 'admin') {
        return res.status(400).json({
          success: false,
          errors: [{ code: 'CANNOT_DEACTIVATE_ADMIN', message: 'Cannot deactivate another admin. Demote first.' }],
        });
      }
    }

    const user = await adminService.setUserActive(targetId, active);
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Top users
router.get('/users/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await adminService.getTopUsers(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Quiz activity trends
router.get('/quizzes/activity', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await adminService.getQuizActivity(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Top quizzes
router.get('/quizzes/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await adminService.getTopQuizzes(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Attempt trends. Supports ?days=N and ?userType=all|real|guest.
router.get('/attempts/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const userType = req.query.userType || 'all';
    const data = await adminService.getAttemptTrends(days, userType);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Score distribution
router.get('/attempts/scores', async (req, res) => {
  try {
    const data = await adminService.getScoreDistribution();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Pass/fail ratio
router.get('/attempts/pass-fail', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await adminService.getPassFailRatio(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Module stats
router.get('/modules/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await adminService.getModuleStats(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// AI usage
router.get('/ai/usage', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await adminService.getAIUsage(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// Recent activity feed
router.get('/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const data = await adminService.getRecentActivity(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

// ===== GAME MODE — admin analytics =====

router.get('/game/overview', async (req, res) => {
  try {
    const data = await adminService.getGameOverview();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

router.get('/game/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await adminService.getGameTrends(days);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

router.get('/game/players/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await adminService.getTopGamePlayers(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

router.get('/game/quizzes/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await adminService.getTopGameQuizzes(limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: 'Internal server error' }] });
  }
});

export default router;
