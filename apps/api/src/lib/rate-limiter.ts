/**
 * Rate limiter in-memory sederhana per key (IP atau email).
 * Untuk single instance API. Jika multi-instance, pindah ke Redis/store bersama.
 */

type LimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, LimitEntry>();

/**
 * Cek apakah key sudah melampaui limit dalam window.
 * Return true jika terlalu banyak request (rate limited).
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // Window baru
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= limit) {
    return true; // Rate limited
  }

  entry.count++;
  return false;
}

/**
 * Reset counter untuk key tertentu (misal setelah login sukses).
 */
export function resetLimit(key: string): void {
  store.delete(key);
}

/**
 * Cleanup expired entries (jalankan periodik).
 */
export function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}
