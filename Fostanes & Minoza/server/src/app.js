import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import { validateEnv, env } from './config/env.js';
import { testConnection } from './database/db.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth/auth.routes.js';
import quizRoutes from './modules/quiz/quiz.routes.js';
import userRoutes from './modules/users/user.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import moduleRoutes from './modules/module/module.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import gameRoutes from './modules/game/game.routes.js';
import { attachGameSocket } from './modules/game/game.socket.js';

// =============================================
// APP SETUP
// =============================================
validateEnv();

const app = express();

// Trust Railway's reverse proxy
if (!env.isDev) {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com", "https://i.ytimg.com"],
      connectSrc: ["'self'", "https://api.dictionaryapi.dev", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://www.googleapis.com"],
      frameSrc: ["'self'", "https://player.vimeo.com", "https://drive.google.com"],
      mediaSrc: ["'self'", "blob:", "data:", "https:"],
      workerSrc: ["'self'", "blob:", "https://unpkg.com"],
    },
  },
}));

// CORS — in production, frontend is served from same origin
const corsOrigin = env.isDev ? env.clientUrl : env.clientUrl;
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// HTTP request logging
app.use(morgan(env.isDev ? 'dev' : ':method :url :status :res[content-length] - :response-time ms'));

// CSRF protection: require X-Requested-With header on state-changing requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
    // Skip for OAuth callback (browser redirect, not fetch)
    if (req.path.includes('/auth/google/callback')) return next();
    if (!req.headers['x-requested-with']) {
      return res.status(403).json({
        success: false,
        errors: [{ code: 'CSRF_REJECTED', message: 'Missing required header' }],
      });
    }
  }
  next();
});

// Global rate limiter
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    errors: [{ code: 'RATE_LIMITED', message: 'Too many requests, please slow down' }],
  },
}));

// Stricter limits
const authLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  message: { success: false, errors: [{ code: 'RATE_LIMITED', message: 'Too many auth attempts' }] },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10,
  message: { success: false, errors: [{ code: 'RATE_LIMITED', message: 'Too many generation requests' }] },
});

// =============================================
// HEALTH CHECK
// =============================================
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection().catch(() => false);
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// =============================================
// API ROUTES
// =============================================
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/quizzes', quizRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/ai', aiLimiter, aiRoutes);
app.use('/api/v1/modules', moduleRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/game', gameRoutes);

// Public stats (no auth required) — used on homepage
app.get('/api/v1/public/stats', async (req, res) => {
  try {
    const { cached } = await import('./utils/cache.js');
    const { query: dbQuery } = await import('./database/db.js');
    const data = await cached('public:stats', async () => {
      const [users, quizzes, attempts, mods] = await Promise.all([
        dbQuery('SELECT COUNT(*) as count FROM users'),
        dbQuery('SELECT COUNT(*) as count FROM quizzes'),
        dbQuery('SELECT COUNT(*) as count FROM attempts'),
        dbQuery('SELECT COUNT(*) as count FROM modules'),
      ]);
      return {
        totalUsers: parseInt(users.rows[0].count),
        totalQuizzes: parseInt(quizzes.rows[0].count),
        totalAttempts: parseInt(attempts.rows[0].count),
        totalModules: parseInt(mods.rows[0].count),
      };
    }, 60000); // 60s cache
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, errors: [{ message: err.message }] });
  }
});

// =============================================
// PRODUCTION: Serve frontend static files
// =============================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.join(__dirname, '../../client/dist');

if (!env.isDev) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // 404 for dev (API-only)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      errors: [{ code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` }],
    });
  });
}

// Error handler (must be last)
app.use(errorHandler);

// =============================================
// START
// =============================================
export async function startServer() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[Server] Cannot start without database. Exiting.');
    process.exit(1);
  }

  // Wrap Express in an http.Server so Socket.IO can attach to the
  // same HTTP server (same port, same origin). app.listen() returns
  // a server but we want an explicit handle for Socket.IO.
  const httpServer = http.createServer(app);
  attachGameSocket(httpServer);

  httpServer.listen(env.port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║         🏛️  LEXARA SERVER               ║
╠══════════════════════════════════════════╣
║  Port:     ${String(env.port).padEnd(28)}║
║  Env:      ${String(env.nodeEnv).padEnd(28)}║
║  Client:   ${String(env.clientUrl).padEnd(28)}║
║  AI:       ${String(env.defaultAiProvider === 'mistral' ? `Mistral (${env.mistralModel})` : `Gemini (${env.geminiModel})`).padEnd(28)}║
╚══════════════════════════════════════════╝
    `);

    // Cleanup expired refresh tokens every hour
    setInterval(async () => {
      try {
        const { query: dbQuery } = await import('./database/db.js');
        const result = await dbQuery('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
        if (result.rowCount > 0) {
          console.log(`[Cleanup] Removed ${result.rowCount} expired refresh tokens`);
        }
      } catch (err) {
        console.error('[Cleanup] Failed to purge expired tokens:', err.message);
      }
    }, 60 * 60 * 1000);

    // Reap stale game lobbies every 5 minutes. Closes 'open' lobbies
    // that have been idle for too long and 'in_progress' lobbies that
    // exceeded a sanity timeout. Keeps the active lobbies count honest
    // for the global cap and prevents zombie rooms from cluttering
    // the lobby browser.
    setInterval(async () => {
      try {
        const { reapStaleLobbies } = await import('./modules/game/game.service.js');
        const closed = await reapStaleLobbies();
        if (closed > 0) {
          console.log(`[Cleanup] Reaped ${closed} stale game lobb${closed === 1 ? 'y' : 'ies'}`);
        }
      } catch (err) {
        console.error('[Cleanup] Failed to reap stale lobbies:', err.message);
      }
    }, 5 * 60 * 1000);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  process.exit(0);
});

export default app;
