import { expect, test } from 'vitest';
import type { Rubric } from '../data-types.ts';
import { groupScores } from './group-scores.ts';

const rubric: Rubric = {
  schemaVersion: 1,
  kind: 'hook',
  version: '1.0.0',
  signals: [
    { id: 'lastPush', group: 'maintenance', max: 10, scale: { type: 'present' } },
    { id: 'license', group: 'license', max: 20, scale: { type: 'present' } },
    { id: 'release', group: 'maintenance', max: 5, scale: { type: 'present' } },
  ],
  flagPenalties: [],
};

test('sums the points and maximums of each group in the order the rubric first names it', () => {
  const parts = [
    { signal: 'license', points: 10, max: 20 },
    { signal: 'lastPush', points: 7.5, max: 10 },
    { signal: 'release', points: 5, max: 5 },
  ];
  expect(groupScores(rubric, parts)).toEqual([
    { group: 'maintenance', points: 12.5, max: 15, signals: ['lastPush', 'release'] },
    { group: 'license', points: 10, max: 20, signals: ['license'] },
  ]);
});

test('refuses a score that lacks a signal of the rubric', () => {
  expect(() => groupScores(rubric, [{ signal: 'license', points: 10, max: 20 }])).toThrow(/lastPush/);
});
