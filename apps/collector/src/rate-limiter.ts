import type { Clock } from './clock.ts';

/** Returns a gate that spaces the starts of the calls awaiting it at least `intervalMs` apart, in call order. */
export function createRateLimiter(clock: Clock, intervalMs: number): () => Promise<void> {
  let nextStart = Number.NEGATIVE_INFINITY;
  return async () => {
    const now = clock.now();
    const start = Math.max(now, nextStart);
    nextStart = start + intervalMs;
    if (start > now) await clock.sleep(start - now);
  };
}
