import { z } from 'zod';
import type { FitLabel, Kind, LicenseClass, Maintenance } from './data-types.ts';
import { fitLabels, kinds, licenseClasses, maintenanceStates } from './vocabulary.ts';

// The page policy allows no eval, and zod's `new Function` probe would be reported as a violation.
z.config({ jitless: true });

export const columnIds = [
  'name',
  'kind',
  'score',
  'stars',
  'starsGained30d',
  'licenseClass',
  'fit',
  'listedOfficial',
  'pushedAt',
  'flagCount',
] as const;
export type ColumnId = (typeof columnIds)[number];

export const defaultSearch = {
  q: '',
  kinds: [] as Kind[],
  tag: '',
  license: [] as LicenseClass[],
  fit: [] as FitLabel[],
  maintenance: [] as Maintenance[],
  scoreMin: undefined as number | undefined,
  scoreMax: undefined as number | undefined,
  starsMin: undefined as number | undefined,
  starsMax: undefined as number | undefined,
  gainMin: undefined as number | undefined,
  noFlags: false,
  official: false,
  sort: 'score.desc',
  cols: ['name', 'kind', 'score', 'stars', 'starsGained30d', 'pushedAt'] as ColumnId[],
  page: 1,
};

/** A field that falls back to its default on an invalid value, so an old or edited link still opens. */
function field<T extends z.ZodType>(schema: T, fallback: Exclude<z.output<T>, undefined>) {
  return schema.optional().default(fallback).catch(fallback);
}

function bound(schema: z.ZodNumber) {
  return schema.optional().catch(undefined);
}

/** The list route's search parameters: the whole table state, so a reload or a shared link restores it. */
export const listSearch = z.object({
  q: field(z.string().max(200), defaultSearch.q),
  kinds: field(z.array(z.enum(kinds)), defaultSearch.kinds),
  tag: field(z.string().max(64), defaultSearch.tag),
  license: field(z.array(z.enum(licenseClasses)), defaultSearch.license),
  fit: field(z.array(z.enum(fitLabels)), defaultSearch.fit),
  maintenance: field(z.array(z.enum(maintenanceStates)), defaultSearch.maintenance),
  scoreMin: bound(z.number().min(0).max(100)),
  scoreMax: bound(z.number().min(0).max(100)),
  starsMin: bound(z.int().min(0)),
  starsMax: bound(z.int().min(0)),
  gainMin: bound(z.int()),
  noFlags: field(z.boolean(), defaultSearch.noFlags),
  official: field(z.boolean(), defaultSearch.official),
  sort: field(z.string().regex(new RegExp(`^(?:${columnIds.join('|')})\\.(?:asc|desc)$`)), defaultSearch.sort),
  cols: field(z.array(z.enum(columnIds)).min(1), defaultSearch.cols),
  page: field(z.int().min(1), defaultSearch.page),
});

export type ListSearch = z.output<typeof listSearch>;
export type ListFilters = Omit<ListSearch, 'sort' | 'cols' | 'page'>;
