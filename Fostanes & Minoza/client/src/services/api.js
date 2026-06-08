const API_BASE = import.meta.env.PROD ? '/api/v1' : 'http://localhost:3000/api/v1';

// In dev the client runs on :5173 and the server on :3000, so any relative URLs
// the server stores in JSON (like reader-image src URLs) need to be rewritten
// to the API host. In prod everything is same-origin so this is a no-op.
export const API_HOST = import.meta.env.PROD ? '' : 'http://localhost:3000';

/**
 * Resolve a server-issued absolute path (e.g. "/api/v1/modules/abc/reader-image/p1-i0")
 * into a URL the browser can actually fetch in both dev and prod.
 */
export function resolveApiUrl(pathOrUrl) {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl; // already absolute
  if (pathOrUrl.startsWith('/api/')) return `${API_HOST}${pathOrUrl}`;
  return pathOrUrl;
}

/**
 * Fetch wrapper with credentials (cookies) and error handling.
 */
async function request(endpoint, options = {}) {
  const config = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...options.headers },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, config);

  // Handle 401 — try refresh, unless caller asked for a silent probe.
  if (res.status === 401 && !options._retried && !options._silent) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return request(endpoint, { ...options, _retried: true });
    }
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.errors?.[0]?.message || 'Request failed');
    error.status = res.status;
    error.errors = data?.errors;
    throw error;
  }

  return data;
}

async function refreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'fetch' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ===== AUTH =====
export const auth = {
  /**
   * Build the Google OAuth start URL.
   * @param {string} [mergeFromGuestId] If the caller is currently a guest,
   *   pass the guest user id so the server can merge their attempts into the
   *   resulting Google account after consent.
   */
  getGoogleUrl: (mergeFromGuestId) =>
    mergeFromGuestId
      ? `${API_BASE}/auth/google?merge_from=${encodeURIComponent(mergeFromGuestId)}`
      : `${API_BASE}/auth/google`,
  me: () => request('/auth/me'),
  meSilent: async () => {
    try {
      return await request('/auth/me', { _silent: true });
    } catch (err) {
      if (err.status === 401) return null;
      throw err;
    }
  },
  guest: (displayName) => request('/auth/guest', { method: 'POST', body: { displayName } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  refresh: () => refreshToken(),
};

// ===== QUIZZES =====
export const quizzes = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/quizzes${qs ? `?${qs}` : ''}`);
  },
  get: (id) => request(`/quizzes/${id}`),
  take: (id) => request(`/quizzes/${id}/take`),
  create: (data) => request('/quizzes', { method: 'POST', body: data }),
  update: (id, data) => request(`/quizzes/${id}`, { method: 'PATCH', body: data }),
  submit: (id, data) => request(`/quizzes/${id}/submit`, { method: 'POST', body: data }),
  check: (id, answers) => request(`/quizzes/${id}/check`, { method: 'POST', body: { answers } }),
  getAttempt: (attemptId) => request(`/quizzes/attempts/${attemptId}`),
  delete: (id) => request(`/quizzes/${id}`, { method: 'DELETE' }),
  leaderboard: (id) => request(`/quizzes/${id}/leaderboard`),
};

// ===== USERS =====
export const users = {
  stats: () => request('/users/me/stats'),
  attempts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/users/me/attempts${qs ? `?${qs}` : ''}`);
  },
  leaderboard: () => request('/users/leaderboard'),
  update: (data) => request('/users/me', { method: 'PATCH', body: data }),

  // ----- AI provider keys (per-user, encrypted on the server) -----
  /** List which providers I've saved keys for. Returns { mistral: { hasKey, last4, model }, gemini: ... } */
  listAIKeys: () => request('/users/me/ai-keys'),
  /** Save (or replace) a key. Server validates by test-firing against the provider before storing. */
  saveAIKey: (provider, payload) =>
    request(`/users/me/ai-keys/${provider}`, { method: 'PUT', body: payload }),
  /** Remove a saved key. */
  deleteAIKey: (provider) =>
    request(`/users/me/ai-keys/${provider}`, { method: 'DELETE' }),
};

// ===== AI =====
export const ai = {
  generate: (content, config, providerConfig) => request('/ai/generate', { method: 'POST', body: { content, config, providerConfig } }),
  generateFromTopic: (topic, config, providerConfig) => request('/ai/generate-from-topic', { method: 'POST', body: { topic, config, providerConfig } }),

  /** Analyze a file to detect if it's a quiz or learning material */
  analyzeFile: async (file, providerConfig = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (providerConfig.provider) formData.append('provider', providerConfig.provider);
    if (providerConfig.apiKey) formData.append('apiKey', providerConfig.apiKey);
    if (providerConfig.model) formData.append('model', providerConfig.model);
    if (providerConfig.baseUrl) formData.append('baseUrl', providerConfig.baseUrl);

    const res = await fetch(`${API_BASE}/ai/analyze-file`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'fetch' },
      body: formData,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(data?.errors?.[0]?.message || 'File analysis failed');
      error.status = res.status;
      throw error;
    }
    return data;
  },

  /** Extract quiz questions from content that already contains a quiz */
  extractQuiz: (content, providerConfig) => request('/ai/extract-quiz', { method: 'POST', body: { content, providerConfig } }),

  /** Generate quiz from file (learning material — needs config) */
  generateFromFile: async (file, config, providerConfig = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('questionCount', config.questionCount || 10);
    formData.append('difficulty', config.difficulty || 'medium');
    formData.append('questionTypes', JSON.stringify(config.questionTypes || ['mcq', 'truefalse']));
    if (providerConfig.provider) formData.append('provider', providerConfig.provider);
    if (providerConfig.apiKey) formData.append('apiKey', providerConfig.apiKey);
    if (providerConfig.model) formData.append('model', providerConfig.model);
    if (providerConfig.baseUrl) formData.append('baseUrl', providerConfig.baseUrl);

    const res = await fetch(`${API_BASE}/ai/generate-from-file`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'fetch' },
      body: formData,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(data?.errors?.[0]?.message || 'File upload failed');
      error.status = res.status;
      throw error;
    }
    return data;
  },
  getProviders: () => request('/ai/providers'),
};

// ===== MODULES =====
export const modules = {
  list: () => request('/modules'),
  listPublic: () => request('/modules/public'),
  get: (id) => request(`/modules/${id}`),
  upload: async (file, title) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    const res = await fetch(`${API_BASE}/modules`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'fetch' },
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(data?.errors?.[0]?.message || 'Upload failed');
      error.status = res.status;
      throw error;
    }
    return data;
  },
  update: (id, data) => request(`/modules/${id}`, { method: 'PATCH', body: data }),
  delete: (id) => request(`/modules/${id}`, { method: 'DELETE' }),
  getFileUrl: (id) => `${API_BASE}/modules/${id}/file`,
  getReader: (id) => request(`/modules/${id}/reader`),
};

// ===== SHARING =====
export function getShareUrl(quizId) {
  return `${window.location.origin}/quiz/${quizId}`;
}

// ===== PUBLIC =====
export const publicApi = {
  stats: () => request('/public/stats'),
};

// ===== ADMIN =====
export const admin = {
  stats: () => request('/admin/stats'),
  usersGrowth: (days = 30) => request(`/admin/users/growth?days=${days}`),
  usersList: (page = 1, limit = 20, search = '', role = 'all') =>
    request(`/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}`),
  usersTop: (limit = 10) => request(`/admin/users/top?limit=${limit}`),
  userSetActive: (id, active) => request(`/admin/users/${id}/status`, { method: 'PATCH', body: { active } }),
  quizzesActivity: (days = 30) => request(`/admin/quizzes/activity?days=${days}`),
  quizzesTop: (limit = 10) => request(`/admin/quizzes/top?limit=${limit}`),
  attemptsTrends: (days = 30, userType = 'all') =>
    request(`/admin/attempts/trends?days=${days}&userType=${encodeURIComponent(userType)}`),
  attemptsScores: () => request('/admin/attempts/scores'),
  attemptsPassFail: (days = 30) => request(`/admin/attempts/pass-fail?days=${days}`),
  modulesStats: (days = 30) => request(`/admin/modules/stats?days=${days}`),
  aiUsage: (days = 30) => request(`/admin/ai/usage?days=${days}`),
  activity: (limit = 20) => request(`/admin/activity?limit=${limit}`),

  // Game Mode admin
  gameOverview: () => request('/admin/game/overview'),
  gameTrends: (days = 30) => request(`/admin/game/trends?days=${days}`),
  topGamePlayers: (limit = 10) => request(`/admin/game/players/top?limit=${limit}`),
  topGameQuizzes: (limit = 10) => request(`/admin/game/quizzes/top?limit=${limit}`),
};

// ===== GAME MODE (Quiz Bowl) =====
// REST endpoints only. Real-time events go through the socket.io
// connection which is wired up in a separate service module (later).
export const game = {
  /** Public probe — used by the Dashboard to decide whether to render
   *  the Game Mode entry-point. No auth required. */
  status: () => request('/game/status'),

  /** Lobby lifecycle. */
  createLobby: (body) => request('/game/lobbies', { method: 'POST', body }),
  listLobbies: (limit = 20) => request(`/game/lobbies?limit=${limit}`),
  getMyLobby: () => request('/game/lobbies/me'),
  getLobby: (id) => request(`/game/lobbies/${id}`),
  joinLobby: (id, role = 'player') =>
    request(`/game/lobbies/${id}/join`, { method: 'POST', body: { role } }),
  leaveLobby: (id) => request(`/game/lobbies/${id}/leave`, { method: 'POST' }),

  /** Lobby-room actions (host or member). */
  setQuiz: (id, quizId) =>
    request(`/game/lobbies/${id}/quiz`, { method: 'PUT', body: { quizId } }),
  setReady: (id, ready) =>
    request(`/game/lobbies/${id}/ready`, { method: 'PUT', body: { ready } }),
  pickAvatar: (id, avatarId) =>
    request(`/game/lobbies/${id}/avatar`, { method: 'PUT', body: { avatarId } }),
  switchRole: (id, role) =>
    request(`/game/lobbies/${id}/role`, { method: 'PUT', body: { role } }),
  kick: (id, targetUserId) =>
    request(`/game/lobbies/${id}/kick`, { method: 'POST', body: { targetUserId } }),

  /** Stats card data for the dashboard. */
  myStats: () => request('/game/stats/me'),
};

export default { auth, quizzes, users, ai, modules, admin, game, getShareUrl };
