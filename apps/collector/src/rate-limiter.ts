import type { Clock } from './clock.ts';

/**
 * Spaces the starts of the calls awaiting `waitTurn` at least `intervalMs` apart, in call order.
 * `hold(ms)` starts no call before `ms` from now, such as while a rate limit lasts.
 */
export function createRateLimiter(clock: Clock, intervalMs: number) {
  let nextStart = Number.NEGATIVE_INFINITY;
  let heldUntil = Number.NEGATIVE_INFINITY;
  const waitTurn = async (): Promise<void> => {
    const now = clock.now();
    const start = Math.max(now, nextStart, heldUntil);
    nextStart = start + intervalMs;
    if (start > now) await clock.sleep(start - now);
    // A hold that began while this call slept sends it back into the queue.
    if (heldUntil > clock.now()) await waitTurn();
  };
  const hold = (ms: number): void => {
    heldUntil = Math.max(heldUntil, clock.now() + ms);
  };
  return { waitTurn, hold };
}
