import type { PopularityFile } from '@directory/contracts';
import { expect, it } from 'vitest';
import { starsGained30d, withSnapshot } from './popularity-file.ts';

const file: PopularityFile = {
  schemaVersion: 1,
  id: 'gh.example-org.tool',
  snapshots: [
    { date: '2026-09-28', stars: 100 },
    { date: '2026-10-05', stars: 120 },
    { date: '2026-10-19', stars: 150 },
    { date: '2026-11-09', stars: 170 },
  ],
};

it('measures the stars gained since the count 30 days before the run', () => {
  expect([
    starsGained30d(file, 200, '2026-11-16'),
    starsGained30d(file, 160, '2026-10-30'),
    starsGained30d(file, 120, '2026-10-27'),
  ]).toEqual([80, 60, undefined]);
});

it('adds a snapshot dated Monday only when the count changed, one per week', () => {
  expect(withSnapshot(file, file.id, 170, '2026-11-20')).toBe(file);
  expect(withSnapshot(file, file.id, 175, '2026-11-12').snapshots.slice(-2)).toEqual([
    { date: '2026-10-19', stars: 150 },
    { date: '2026-11-09', stars: 175 },
  ]);
  expect(withSnapshot(file, file.id, 180, '2026-11-22').snapshots.slice(-2)).toEqual([
    { date: '2026-11-09', stars: 170 },
    { date: '2026-11-16', stars: 180 },
  ]);
  expect(withSnapshot(file, file.id, 150, '2026-11-12').snapshots.slice(-2)).toEqual([
    { date: '2026-10-05', stars: 120 },
    { date: '2026-10-19', stars: 150 },
  ]);
  expect(withSnapshot(undefined, 'gh.example-org.new', 3, '2026-11-16')).toEqual({
    schemaVersion: 1,
    id: 'gh.example-org.new',
    snapshots: [{ date: '2026-11-16', stars: 3 }],
  });
});
