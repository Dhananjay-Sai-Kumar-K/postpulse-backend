/**
 * Simple in-memory cache with TTL support.
 * Can be swapped for Redis later without changing the interface.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  /**
   * Get a cached value by key.
   * Returns null if expired or not found.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Store a value with TTL in minutes.
   */
  set<T>(key: string, data: T, ttlMinutes: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    });
  }

  /**
   * Invalidate a specific key.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache stats for debugging.
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Singleton instance
export const cache = new MemoryCache();
