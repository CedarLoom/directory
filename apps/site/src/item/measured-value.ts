import type { ItemRecord } from '../data-types.ts';

export type Measured =
  | { type: 'date'; value: string }
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'yes-no'; value: boolean }
  | { type: 'none' };

/** The value a rubric signal read from the record, mirroring where the scorer reads it. */
export function measuredValue(record: ItemRecord, signal: string): Measured {
  const { maintenance } = record;
  if (signal === 'lastPush')
    return maintenance === undefined ? { type: 'none' } : { type: 'date', value: maintenance.pushedAt };
  if (signal === 'recentCommits')
    return maintenance === undefined ? { type: 'none' } : { type: 'text', value: maintenance.recentCommits };
  if (signal === 'license') return { type: 'text', value: record.license.spdx ?? record.license.class };
  if (signal === 'safety') return { type: 'number', value: record.flags.length };
  const value = record.signals[signal];
  if (value === undefined) return { type: 'none' };
  return typeof value === 'boolean' ? { type: 'yes-no', value } : { type: 'number', value };
}
