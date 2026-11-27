import type { Maintenance, Row } from './data-types.ts';
import type { ListFilters } from './list-search.ts';

const activeDays = 90;
const day = 86_400_000;

/** The maintenance state of a row at the run date: a push in the last 90 days is active. */
export function maintenanceOf(row: Row, runAt: string): Maintenance {
  if (row.archived) return 'archived';
  if (row.pushedAt === undefined) return 'unknown';
  return Date.parse(runAt) - Date.parse(row.pushedAt) <= activeDays * day ? 'active' : 'inactive';
}

function matchesText(row: Row, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [row.name, row.owner ?? '', ...row.tags].some((text) => text.toLowerCase().includes(needle));
}

function within(value: number | undefined, min: number | undefined, max: number | undefined): boolean {
  if (min === undefined && max === undefined) return true;
  // A row without the value fails any bound on it.
  if (value === undefined) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function oneOf<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

/** The rows that pass every filter; an empty choice or an absent bound does not filter. */
export function filterRows(rows: readonly Row[], filters: ListFilters, runAt: string): Row[] {
  const tests: ((row: Row) => boolean)[] = [
    (row) => matchesText(row, filters.q),
    (row) => oneOf(filters.kinds, row.kind),
    (row) => filters.tag === '' || row.tags.includes(filters.tag),
    (row) => oneOf(filters.license, row.licenseClass),
    (row) => oneOf(filters.maintenance, maintenanceOf(row, runAt)),
    (row) => within(row.score, filters.scoreMin, filters.scoreMax),
    (row) => within(row.stars, filters.starsMin, filters.starsMax),
    // A gain that is not measured fails a minimum gain.
    (row) => within(row.starsGained30d, filters.gainMin, undefined),
    (row) => !filters.noFlags || row.flagCount === 0,
    (row) => !filters.official || row.listedOfficial,
  ];
  return rows.filter((row) => tests.every((test) => test(row)));
}
