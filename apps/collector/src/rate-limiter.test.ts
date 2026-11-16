import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rate-limiter.ts';

// A clock over the faked timers, so sleeps end in the order they are due.
const clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

it('spaces the starts of concurrent calls by the interval', async () => {
  const { waitTurn } = createRateLimiter(clock, 1000);
  const starts = Promise.all(
    [1, 2, 3].map(async () => {
      await waitTurn();
      return clock.now();
    }),
  );
  await vi.runAllTimersAsync();
  expect(await starts).toEqual([0, 1000, 2000]);
});

it('lets a call through at once when the interval has passed', async () => {
  const { waitTurn } = createRateLimiter(clock, 1000);
  await waitTurn();
  vi.setSystemTime(1500);
  await waitTurn();
  const second = clock.now();
  const third = waitTurn().then(() => clock.now());
  await vi.runAllTimersAsync();
  expect([second, await third]).toEqual([1500, 2500]);
});
