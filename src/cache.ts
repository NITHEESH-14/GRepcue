// ============================================================================
// GRepcue — In-Memory Cache with TTL
// Prevents redundant GitHub API calls and handles rate limits gracefully.
// ============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with time-to-live (TTL) expiration.
 * Keys are strings, values can be any type.
 */
export class CacheStore<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttl: number;

  /**
   * @param ttlMs Time-to-live in milliseconds (default: 1 hour)
   */
  constructor(ttlMs: number = 3600000) {
    this.ttl = ttlMs;
  }

  /**
   * Get a cached value by key. Returns undefined if expired or missing.
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Store a value with automatic TTL expiration.
   */
  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttl,
    });
  }

  /**
   * Check if a non-expired value exists for the key.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Remove a specific key from the cache.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Remove all expired entries (garbage collection).
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get the number of active (non-expired) entries.
   */
  get size(): number {
    this.cleanup();
    return this.store.size;
  }
}

/**
 * Generate a cache key from a query and options.
 */
export function makeCacheKey(prefix: string, ...parts: unknown[]): string {
  return `${prefix}:${JSON.stringify(parts)}`;
}
