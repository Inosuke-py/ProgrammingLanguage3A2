/**
 * Simple in-memory cache with TTL expiration and LRU eviction.
 *
 * - TTL caps the lifetime of each entry (default 30s).
 * - MAX_ENTRIES caps total memory usage. When the cap is hit, the oldest
 *   inserted entry is evicted (Map preserves insertion order, and we
 *   re-insert on read to bump entries to the "newest" end so frequently-
 *   accessed entries naturally survive eviction).
 * - A periodic sweep removes entries past their TTL so memory doesn't
 *   accumulate dead data even when no new requests touch it.
 *
 * Primary use: avoid hitting the DB twice for the same data within a
 * 30-second window (admin overview, leaderboards, public stats, single
 * quiz fetches during a take).
 */
const store = new Map();
const MAX_ENTRIES = 500;     // hard cap to prevent unbounded growth

/**
 * Get a cached value, or fetch it using the provided function.
 *
 * Returns a STRUCTURED CLONE of the cached value, not the shared reference.
 * Without this, any caller mutating the returned object would corrupt the
 * cache entry (e.g. getQuizForTaking used to strip correct_answer in place,
 * which broke grading for the next caller). Cloning is cheap for the
 * JSON-shaped rows we cache here, and removes a whole category of bug.
 *
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to call on cache miss
 * @param {number} ttlMs - Time to live in milliseconds (default: 30s)
 */
export async function cached(key, fetchFn, ttlMs = 30000) {
  const entry = store.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    // LRU bump — re-insert moves the key to the end (newest position).
    store.delete(key);
    store.set(key, entry);
    return cloneValue(entry.value);
  }

  const value = await fetchFn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });

  // Evict the oldest entry if over the cap. Map preserves insertion
  // order, so the FIRST key is the LRU candidate.
  if (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }

  return cloneValue(value);
}

/**
 * Defensive deep clone. Falls back to JSON round-trip on engines without
 * structuredClone (very old Node), and to identity for primitives where
 * cloning is unnecessary.
 */
function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidate(keyOrPrefix) {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  // Prefix match
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

/**
 * Clear the entire cache.
 */
export function clearAll() {
  store.clear();
}

// Auto-cleanup expired entries every 60s.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.expiresAt) store.delete(key);
  }
}, 60000);

export default { cached, invalidate, clearAll };
