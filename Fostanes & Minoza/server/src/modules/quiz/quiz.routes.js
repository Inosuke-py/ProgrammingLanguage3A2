import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import * as quizService from './quiz.service.js';

const router = Router();

// --- Validation Schemas ---
const createQuizSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional().default(false),
  allowPractice: z.boolean().optional().default(true),
  passingScore: z.number().int().min(0).max(100).optional().default(70),
  timeLimitPerQuestion: z.number().int().min(0).optional().default(0),
  timeLimitTotal: z.number().int().min(0).optional().default(0),
  sourceType: z.enum(['pdf', 'file', 'text', 'url', 'topic']).optional(),
  questions: z.array(z.object({
    type: z.enum(['mcq', 'truefalse', 'fillinblank']),
    question: z.string().min(1),
    options: z.array(z.string()).optional().default([]),
    correctAnswer: z.string().min(1),
    explanation: z.string().optional(),
  })).min(1).max(100),
});

const submitAttemptSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedAnswer: z.string(),
  })),
  timeTaken: z.number().int().min(0),
});

// --- Routes ---

/**
 * POST /quizzes
 * Create a new quiz with questions.
 */
router.post('/', authenticate, validate(createQuizSchema), async (req, res, next) => {
  try {
    const { questions, ...quizData } = req.validated;
    const quiz = await quizService.createQuiz(req.user.id, quizData, questions);
    res.status(201).json({ success: true, data: { quiz } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quizzes
 * List quizzes (own or public).
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, mine } = req.query;
    const options = {
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10) || 20, 50),
    };

    if (mine === 'true' && req.user) {
      options.userId = req.user.id;
    } else {
      options.isPublic = true;
    }

    const result = await quizService.listQuizzes(options);
    res.json({ success: true, data: result.quizzes, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quizzes/attempts/:attemptId
 * Get a single attempt result (for results page refresh).
 */
router.get('/attempts/:attemptId', authenticate, async (req, res, next) => {
  try {
    const attempt = await quizService.getAttemptById(req.params.attemptId, req.user.id);
    if (!attempt) throw new NotFoundError('Attempt');

    const gradedAnswers = typeof attempt.answers === 'string'
      ? JSON.parse(attempt.answers) : attempt.answers;

    res.json({
      success: true,
      data: {
        attempt,
        score: attempt.score,
        xpEarned: attempt.xp_earned,
        correctCount: gradedAnswers.filter(a => a.isCorrect).length,
        totalQuestions: parseInt(attempt.total_questions, 10),
        certificateIssued: attempt.certificate_issued,
        gradedAnswers,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quizzes/:id
 * Get a single quiz (full details for owner, limited for others).
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const quiz = await quizService.getQuizById(req.params.id);
    if (!quiz) throw new NotFoundError('Quiz');

    // If not owner, check public access
    if (quiz.created_by !== req.user?.id && !quiz.is_public) {
      throw new ForbiddenError('This quiz is private');
    }

    res.json({ success: true, data: { quiz } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quizzes/:id/take
 * Get quiz for taking (answers hidden).
 */
router.get('/:id/take', optionalAuth, async (req, res, next) => {
  try {
    const quiz = await quizService.getQuizForTaking(req.params.id);
    if (!quiz) throw new NotFoundError('Quiz');

    if (!quiz.is_public && quiz.created_by !== req.user?.id) {
      throw new ForbiddenError('This quiz is private');
    }

    res.json({ success: true, data: { quiz } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /quizzes/:id/check
 * Practice mode: grade answers without saving an attempt.
 */
router.post('/:id/check', authenticate, async (req, res, next) => {
  try {
    const { answers } = req.body;
    if (!answers?.length) return res.status(400).json({ success: false, errors: [{ message: 'No answers' }] });

    // Check if practice mode is allowed by the quiz owner
    const quiz = await quizService.getQuizById(req.params.id);
    if (!quiz) throw new NotFoundError('Quiz');
    if (!quiz.allow_practice) {
      return res.status(403).json({ success: false, errors: [{ code: 'PRACTICE_DISABLED', message: 'Practice mode is disabled for this quiz' }] });
    }

    const gradedAnswers = await quizService.checkAnswers(req.params.id, answers);
    res.json({ success: true, data: { gradedAnswers } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /quizzes/:id/submit
 * Submit quiz answers for grading.
 */
router.post('/:id/submit', authenticate, validate(submitAttemptSchema), async (req, res, next) => {
  try {
    const result = await quizService.submitAttempt(
      req.user.id,
      req.params.id,
      req.validated.answers,
      req.validated.timeTaken
    );
    res.json({ success: true, data: result });
  } catch (err) {
    // Surface the duplicate-attempt guard as a 409 so the client can show
    // a helpful "Already submitted, redirecting…" message instead of a
    // generic 500. The client useRef guard normally catches this; the
    // server-side check is a defense against replays / multi-tab races.
    if (err.code === 'DUPLICATE_ATTEMPT') {
      return res.status(409).json({
        success: false,
        errors: [{ code: 'DUPLICATE_ATTEMPT', message: 'You already submitted this quiz a moment ago.' }],
      });
    }
    next(err);
  }
});

/**
 * GET /quizzes/:id/leaderboard
 * Get leaderboard for a quiz.
 *
 * Auth required: prevents anonymous scraping of full names + stable user
 * ids attached to a specific quiz id. Sanitizes the response the same
 * way /users/leaderboard does — first name + last initial, no user_id.
 */
router.get('/:id/leaderboard', authenticate, async (req, res, next) => {
  try {
    const entries = await quizService.getLeaderboard(req.params.id, 20);
    const sanitized = entries.map((e) => {
      const parts = (e.display_name || '').trim().split(/\s+/);
      const first = parts[0] || 'User';
      const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : '';
      return {
        name: lastInitial ? `${first} ${lastInitial}` : first,
        bestScore: e.best_score,
        bestTime: e.best_time,
        attemptsCount: e.attempts_count,
        achievedAt: e.achieved_at,
      };
    });
    res.json({ success: true, data: { entries: sanitized } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /quizzes/:id
 * Update a quiz (title, visibility). Owner only.
 */
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const { title, isPublic, allowPractice } = req.body;
    const updated = await quizService.updateQuiz(req.params.id, req.user.id, { title, isPublic, allowPractice });
    if (!updated) throw new NotFoundError('Quiz');
    res.json({ success: true, data: { quiz: updated } });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /quizzes/:id
 * Delete a quiz (owner only).
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const deleted = await quizService.deleteQuiz(req.params.id, req.user.id);
    if (!deleted) throw new NotFoundError('Quiz');
    res.json({ success: true, data: { message: 'Quiz deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
