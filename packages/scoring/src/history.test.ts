import { expect, it } from 'vitest';
import { nextHistory } from './history.ts';

const entries = [{ date: '2026-11-02', rubric: '1.0.0', total: 81 }];
const scoreOf = (total: number, version = '1.0.0') => ({
  rubric: { kind: 'skill' as const, version },
  total,
  parts: [],
});

it('adds no entry while the rounded total and the rubric version stay the same', () =>
  expect(nextHistory(entries, scoreOf(80.6), '2026-11-17')).toBe(entries));

it('adds an entry when the rounded total changes', () =>
  expect(nextHistory(entries, scoreOf(80.4), '2026-11-17')).toEqual([
    { date: '2026-11-02', rubric: '1.0.0', total: 81 },
    { date: '2026-11-17', rubric: '1.0.0', total: 80 },
  ]));

it('adds an entry when the rubric version changes', () =>
  expect(nextHistory(entries, scoreOf(81, '1.1.0'), '2026-11-17')).toEqual([
    { date: '2026-11-02', rubric: '1.0.0', total: 81 },
    { date: '2026-11-17', rubric: '1.1.0', total: 81 },
  ]));

it('starts the history with the first score', () =>
  expect(nextHistory([], scoreOf(64.5), '2026-11-17')).toEqual([{ date: '2026-11-17', rubric: '1.0.0', total: 65 }]));
