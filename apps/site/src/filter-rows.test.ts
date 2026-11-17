import { describe, expect, it } from 'vitest';
import type { Row } from './data-types.ts';
import { filterRows, maintenanceOf } from './filter-rows.ts';
import { defaultSearch } from './list-search.ts';

const runAt = '2026-11-16T04:00:00Z';

function row(id: string, overrides: Partial<Row>): Row {
  return {
    id,
    kind: 'plugin',
    name: id,
    owner: 'example-org',
    score: 50,
    stars: 100,
    starsGained30d: 10,
    licenseClass: 'permissive',
    fit: 'overlaps',
    listedOfficial: false,
    pushedAt: '2026-11-09T08:15:00Z',
    archived: false,
    flagCount: 0,
    tags: ['review'],
    ...overrides,
  };
}

const rows = [
  row('few-stars', { stars: 8, starsGained30d: 1 }),
  row('mid-stars', { stars: 412, starsGained30d: 37 }),
  row('many-stars', { stars: 5210, starsGained30d: 1480 }),
  row('no-stars', { stars: undefined, starsGained30d: undefined }),
  row('losing-stars', { stars: 340, starsGained30d: -12 }),
];

function ids(filters: Partial<typeof defaultSearch>): string[] {
  return filterRows(rows, { ...defaultSearch, ...filters }, runAt).map((match) => match.id);
}

describe('filterRows', () => {
  it('keeps every row without a filter', () => {
    expect(ids({})).toEqual(['few-stars', 'mid-stars', 'many-stars', 'no-stars', 'losing-stars']);
  });

  it('keeps the rows inside an inclusive star range and drops rows without stars', () => {
    expect(ids({ starsMin: 340, starsMax: 412 })).toEqual(['mid-stars', 'losing-stars']);
  });

  it('keeps the rows that gained at least the minimum and drops a gain that is not measured', () => {
    expect(ids({ gainMin: 0 })).toEqual(['few-stars', 'mid-stars', 'many-stars']);
  });
});

describe('maintenanceOf', () => {
  it('counts a push exactly 90 days before the run as active and one a second earlier as inactive', () => {
    expect(maintenanceOf(row('edge', { pushedAt: '2026-08-18T04:00:00Z' }), runAt)).toBe('active');
    expect(maintenanceOf(row('edge', { pushedAt: '2026-08-18T03:59:59Z' }), runAt)).toBe('inactive');
  });
});
