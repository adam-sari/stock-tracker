/**
 * Module-scoped cache for the /api/health response.
 * Extracted from the route file because Next.js routes only allow a fixed
 * set of named exports (GET/POST/etc., config, revalidate, ...). Tests can
 * import this module to reset the cache between runs.
 */
const CACHE_TTL_MS = 30_000;

let _cached: { body: unknown; expiresAt: number } | null = null;

export const healthCache = {
  get(): unknown | null {
    if (_cached && Date.now() < _cached.expiresAt) return _cached.body;
    return null;
  },
  set(body: unknown): void {
    _cached = { body, expiresAt: Date.now() + CACHE_TTL_MS };
  },
  reset(): void {
    _cached = null;
  },
};
