import { expect, test } from 'vitest';
import { scoreBand } from './score-band.ts';

test('a score falls in the band whose lower edge it reaches', () => {
  expect([100, 75, 74.9, 50, 49.9, 25, 24.9, 0].map(scoreBand)).toEqual([
    'high',
    'high',
    'medium',
    'medium',
    'low',
    'low',
    'very-low',
    'very-low',
  ]);
});
