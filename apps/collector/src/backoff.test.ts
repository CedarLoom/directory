import { expect, it } from 'vitest';
import { retryDelay } from './backoff.ts';

const now = 1_800_000_000_000;

it.each([
  { name: '429 with retry-after', status: 429, headers: { 'retry-after': '30' }, attempt: 0, delay: 30_000 },
  { name: '403 with retry-after', status: 403, headers: { 'retry-after': '5' }, attempt: 2, delay: 5000 },
  {
    name: '403 with the primary limit spent',
    status: 403,
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000100' },
    attempt: 0,
    delay: 100_000,
  },
  {
    name: '429 with a reset already past',
    status: 429,
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1799999990' },
    attempt: 0,
    delay: 0,
  },
  { name: '429 without headers, second attempt', status: 429, headers: {}, attempt: 1, delay: 120_000 },
  { name: '503, third attempt', status: 503, headers: {}, attempt: 2, delay: 4000 },
  {
    name: '403 without rate limit headers',
    status: 403,
    headers: { 'x-ratelimit-remaining': '4999' },
    attempt: 0,
    delay: undefined,
  },
  { name: '404', status: 404, headers: {}, attempt: 0, delay: undefined },
])('$name', ({ status, headers, attempt, delay }) =>
  expect(retryDelay({ status, headers: new Headers(headers) }, attempt, now)).toBe(delay),
);
