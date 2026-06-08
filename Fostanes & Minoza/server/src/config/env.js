/**
 * Environment config with validation.
 * Fail fast if required vars are missing.
 */
const required = [
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GEMINI_API_KEY',
  'JWT_SECRET',
];

export function validateEnv() {
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[Config] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('[Config] ✓ All environment variables validated.');
}

export const env = {
  get port() { return parseInt(process.env.PORT || '3000', 10); },
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get isDev() { return this.nodeEnv === 'development'; },
  get clientUrl() {
    if (process.env.CLIENT_URL) return process.env.CLIENT_URL;
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    return 'http://localhost:5173';
  },

  get serverUrl() {
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    return `http://localhost:${process.env.PORT || 3000}`;
  },

  get databaseUrl() { return process.env.DATABASE_URL; },

  get googleClientId() { return process.env.GOOGLE_CLIENT_ID; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET; },
  get googleCallbackUrl() {
    if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
    return `${this.serverUrl}/api/v1/auth/google/callback`;
  },

  get geminiApiKey() { return process.env.GEMINI_API_KEY; },
  get geminiModel() { return process.env.GEMINI_MODEL || 'gemini-2.0-flash'; },

  get mistralApiKey() { return process.env.MISTRAL_API_KEY; },
  get mistralModel() { return process.env.MISTRAL_MODEL || 'mistral-small-latest'; },

  get defaultAiProvider() { return process.env.DEFAULT_AI_PROVIDER || 'mistral'; },

  get jwtSecret() { return process.env.JWT_SECRET; },
  get jwtRefreshSecret() { return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET; },
  get jwtExpiresIn() { return process.env.JWT_EXPIRES_IN || '15m'; },
  get jwtRefreshExpiresIn() { return process.env.JWT_REFRESH_EXPIRES_IN || '7d'; },
};
