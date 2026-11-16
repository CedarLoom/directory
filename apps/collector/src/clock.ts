import { setTimeout as delay } from 'node:timers/promises';

/** Time as the collector reads it; tests pass a fake. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: async (ms) => {
    await delay(ms);
  },
};
