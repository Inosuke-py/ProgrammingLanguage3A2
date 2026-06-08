import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { generateQuizFromContent, generateQuizFromTopic, analyzeContent, extractQuizFromContent } from './ai.service.js';
import { extractTextFromPDF } from './pdf.service.js';
import { logAIRequest } from '../admin/admin.service.js';
import { resolveUserAICreds } from '../users/user.service.js';

const router = Router();

/**
 * Build the providerConfig that gets passed to the AI service.
 *
 * Precedence (handled by resolveUserAICreds):
 *   1. apiKey in request body  (one-off override)
 *   2. user's saved encrypted key
 *   3. platform env fallback (apiKey resolved as null → ai.service uses env)
 */
async function resolveProviderConfig(userId, requestProviderConfig = {}) {
  const provider = requestProviderConfig.provider || process.env.DEFAULT_AI_PROVIDER || 'mistral';
  const creds = await resolveUserAICreds(userId, provider, requestProviderConfig);
  return {
    provider,
    apiKey: creds.apiKey,         // null → ai.service falls back to env
    model: creds.model || undefined,
    baseUrl: creds.baseUrl || undefined,   // only used by openai-compatible
    _source: creds.source,        // for logging/debugging only
  };
}

// Multer config — 10MB max, PDF/DOC/TXT only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// --- Schemas ---
// Provider can be one of the SDK-backed providers (mistral, gemini) or the
// generic 'openai-compatible' bucket which routes to any endpoint that
// speaks the OpenAI Chat Completions protocol (OpenRouter, Groq, OpenAI,
// Together, DeepSeek, etc.).
const providerConfigSchema = z.object({
  provider: z.enum(['mistral', 'gemini', 'openai-compatible']).optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().url().optional(),
}).optional().default({});

const generateFromContentSchema = z.object({
  content: z.string().min(50).max(50000),
  config: z.object({
    questionCount: z.number().int().min(3).max(30).optional().default(10),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    questionTypes: z.array(z.enum(['mcq', 'truefalse', 'fillinblank'])).optional().default(['mcq', 'truefalse']),
    language: z.string().optional().default('English'),
  }).optional().default({}),
  providerConfig: providerConfigSchema,
});

const generateFromTopicSchema = z.object({
  topic: z.string().min(3).max(500),
  config: z.object({
    questionCount: z.number().int().min(3).max(30).optional().default(10),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    questionTypes: z.array(z.enum(['mcq', 'truefalse', 'fillinblank'])).optional().default(['mcq', 'truefalse']),
    language: z.string().optional().default('English'),
  }).optional().default({}),
  providerConfig: providerConfigSchema,
});

// --- Routes ---

/** POST /ai/generate — from text content */
router.post('/generate', authenticate, validate(generateFromContentSchema), async (req, res, next) => {
  try {
    const { content, config, providerConfig: requested } = req.validated;
    const providerConfig = await resolveProviderConfig(req.user.id, requested);
    const result = await generateQuizFromContent(content, config, providerConfig);
    logAIRequest(req.user.id, 'generate').catch(() => {});
    res.json({ success: true, data: { title: result.title, questions: result.questions, questionCount: result.questions.length } });
  } catch (err) { next(err); }
});

/** POST /ai/generate-from-topic — from a topic */
router.post('/generate-from-topic', authenticate, validate(generateFromTopicSchema), async (req, res, next) => {
  try {
    const { topic, config, providerConfig: requested } = req.validated;
    const providerConfig = await resolveProviderConfig(req.user.id, requested);
    const result = await generateQuizFromTopic(topic, config, providerConfig);
    logAIRequest(req.user.id, 'generate-from-topic').catch(() => {});
    res.json({ success: true, data: { title: result.title, questions: result.questions, questionCount: result.questions.length } });
  } catch (err) { next(err); }
});

/**
 * POST /ai/analyze-file — Upload file, extract text, detect if quiz or material.
 * Returns { contentType, summary, questionCount, textContent }
 */
router.post('/analyze-file', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, errors: [{ code: 'NO_FILE', message: 'Please upload a file.' }] });
    }

    const requestedProviderConfig = {
      provider: req.body.provider || undefined,
      apiKey: req.body.apiKey || undefined,
      model: req.body.model || undefined,
      baseUrl: req.body.baseUrl || undefined,
    };
    const providerConfig = await resolveProviderConfig(req.user.id, requestedProviderConfig);

    let textContent;
    if (req.file.mimetype === 'application/pdf') {
      textContent = await extractTextFromPDF(req.file.buffer);
    } else {
      textContent = req.file.buffer.toString('utf-8');
    }
    textContent = String(textContent || '');

    if (!textContent || textContent.trim().length < 50) {
      return res.status(400).json({ success: false, errors: [{ code: 'INSUFFICIENT_CONTENT', message: 'Not enough text in the file (min 50 chars).' }] });
    }

    const analysis = await analyzeContent(textContent, providerConfig);
    logAIRequest(req.user.id, 'analyze-file').catch(() => {});
    res.json({
      success: true,
      data: {
        contentType: analysis.type,
        summary: analysis.summary,
        questionCount: analysis.questionCount,
        textContent,
        sourceFileName: req.file.originalname,
      },
    });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, errors: [{ code: 'FILE_TOO_LARGE', message: 'File must be under 10MB.' }] });
    }
    next(err);
  }
});

/**
 * POST /ai/extract-quiz — Extract questions from content that already contains a quiz.
 */
router.post('/extract-quiz', authenticate, async (req, res, next) => {
  try {
    const { content, providerConfig: requested = {} } = req.body;
    if (!content || content.trim().length < 50) {
      return res.status(400).json({ success: false, errors: [{ code: 'INSUFFICIENT_CONTENT', message: 'Content too short.' }] });
    }
    const providerConfig = await resolveProviderConfig(req.user.id, requested);
    const result = await extractQuizFromContent(content, providerConfig);
    logAIRequest(req.user.id, 'extract-quiz').catch(() => {});
    res.json({ success: true, data: { title: result.title, questions: result.questions, questionCount: result.questions.length } });
  } catch (err) { next(err); }
});

/** POST /ai/generate-from-file — Upload + generate (for learning material with config) */
router.post('/generate-from-file', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, errors: [{ code: 'NO_FILE', message: 'Please upload a file.' }] });
    }

    const config = {
      questionCount: parseInt(req.body.questionCount) || 10,
      difficulty: req.body.difficulty || 'medium',
      questionTypes: req.body.questionTypes ? JSON.parse(req.body.questionTypes) : ['mcq', 'truefalse'],
      language: req.body.language || 'English',
    };

    const providerConfig = await resolveProviderConfig(req.user.id, {
      provider: req.body.provider || undefined,
      apiKey: req.body.apiKey || undefined,
      model: req.body.model || undefined,
      baseUrl: req.body.baseUrl || undefined,
    });

    let textContent;
    if (req.file.mimetype === 'application/pdf') {
      textContent = await extractTextFromPDF(req.file.buffer);
    } else {
      textContent = req.file.buffer.toString('utf-8');
    }
    textContent = String(textContent || '');

    if (!textContent || textContent.trim().length < 50) {
      return res.status(400).json({ success: false, errors: [{ code: 'INSUFFICIENT_CONTENT', message: 'Not enough text in the file (min 50 chars).' }] });
    }

    const result = await generateQuizFromContent(textContent, config, providerConfig);
    logAIRequest(req.user.id, 'generate-from-file').catch(() => {});
    res.json({ success: true, data: { title: result.title, questions: result.questions, questionCount: result.questions.length, sourceFileName: req.file.originalname } });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, errors: [{ code: 'FILE_TOO_LARGE', message: 'File must be under 10MB.' }] });
    }
    next(err);
  }
});

/** GET /ai/providers — list available providers */
router.get('/providers', (req, res) => {
  res.json({
    success: true,
    data: {
      default: process.env.DEFAULT_AI_PROVIDER || 'mistral',
      providers: [
        { id: 'mistral', name: 'Mistral AI', description: 'Fast, efficient — default provider', requiresKey: false },
        { id: 'gemini', name: 'Google Gemini', description: 'Google\'s multimodal AI', requiresKey: false },
      ],
    },
  });
});

export default router;
