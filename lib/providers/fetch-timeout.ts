/**
 * Wrapper around the global `fetch` that enforces a deadline via AbortSignal.
 * Returns a Response or rejects with an AbortError when the timeout fires —
 * the caller can catch and treat it as a provider miss.
 *
 * Per the design spec, providers should use:
 *   - 3 000 ms for live quotes
 *   - 15 000 ms for news / profile / fundamentals
 *   - 30 000 ms for bulk pulls (13F, full-day Form 4)
 */
export const TIMEOUT_QUOTE_MS = 3_000;
export const TIMEOUT_BULK_MS = 30_000;
export const TIMEOUT_DEFAULT_MS = 15_000;

export function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUT_DEFAULT_MS,
): Promise<Response> {
  // Compose with any pre-existing signal (caller may already be aborting).
  const ownSignal = AbortSignal.timeout(timeoutMs);
  let signal: AbortSignal = ownSignal;
  if (init.signal) {
    // Node 20+ has AbortSignal.any; in older runtimes the caller's signal wins.
    if (typeof (AbortSignal as unknown as { any?: unknown }).any === 'function') {
      signal = (AbortSignal as unknown as { any: (sigs: AbortSignal[]) => AbortSignal }).any([init.signal, ownSignal]);
    } else {
      signal = init.signal;
    }
  }
  return fetch(url, { ...init, signal });
}
