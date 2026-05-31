/**
 * Tiny in-memory cache for GET requests.
 *
 * Behaviour:
 *   - First call hits the network.
 *   - Subsequent calls within `ttlMs` return the cached value INSTANTLY,
 *     and trigger a background refresh so the next call gets fresh data.
 *   - Cache is per-tab; cleared on hard refresh.
 *
 * Use this for endpoints that change rarely between navigations:
 * badges, leaderboards, profile, classroom rosters, etc.
 *
 * Do NOT use for: notifications unread count, presence heartbeat, anything
 * that must be live-fresh on every read.
 */
import api from './api'

interface CacheEntry<T> {
  data: T
  fetchedAt: number
  inflight: Promise<T> | null
}

const cache = new Map<string, CacheEntry<unknown>>()

const DEFAULT_TTL_MS = 30_000  // 30 seconds — matches typical navigation patterns

export interface CachedQueryOptions {
  /** Override the default 30s TTL. */
  ttlMs?: number
  /** If true, skip cache and force a fresh fetch (still updates cache). */
  forceRefresh?: boolean
}

/**
 * Get cached data instantly if fresh; otherwise fetch and cache.
 * Optionally returns stale data immediately while a background refresh runs.
 */
export async function cachedGet<T>(
  url: string,
  options: CachedQueryOptions = {}
): Promise<T> {
  const { ttlMs = DEFAULT_TTL_MS, forceRefresh = false } = options
  const now = Date.now()
  const entry = cache.get(url) as CacheEntry<T> | undefined

  // Stale-while-revalidate: return cached immediately, refresh in background
  if (entry && !forceRefresh) {
    const age = now - entry.fetchedAt
    if (age < ttlMs) {
      // Fresh: return immediately
      return entry.data
    }
    // Stale but exists: kick off background refresh, but still return cached
    // value to the caller. The next call will get fresh data.
    if (!entry.inflight) {
      entry.inflight = fetchAndStore<T>(url).catch(() => entry.data)
    }
    return entry.data
  }

  // No cache: hit network
  if (entry?.inflight) return entry.inflight as Promise<T>
  const promise = fetchAndStore<T>(url)
  cache.set(url, {
    data: undefined as unknown as T,
    fetchedAt: 0,
    inflight: promise,
  })
  return promise
}

async function fetchAndStore<T>(url: string): Promise<T> {
  const res = await api.get<T>(url)
  cache.set(url, {
    data: res.data,
    fetchedAt: Date.now(),
    inflight: null,
  })
  return res.data
}

/**
 * Manually invalidate a cache key. Call this after a mutation so the next
 * read of the same URL goes to the network.
 *
 * Pattern matching: invalidate('/badges/') drops just that exact key.
 * Use invalidatePrefix('/badges') to drop everything starting with '/badges'.
 */
export function invalidate(url: string): void {
  cache.delete(url)
}

export function invalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

/** Drop everything. Useful on logout. */
export function clearCache(): void {
  cache.clear()
}
