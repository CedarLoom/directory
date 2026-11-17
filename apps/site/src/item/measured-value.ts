import type { MessageDescriptor } from '@lingui/core';
import type { Flag, ItemRecord } from '../data-types.ts';
import { licenseWithoutId, recentCommitsLabels } from '../labels.ts';

export type Measured =
  | { type: 'date'; value: string }
  | { type: 'text'; value: string }
  | { type: 'message'; value: MessageDescriptor }
  | { type: 'flags'; value: readonly Flag[] }
  | { type: 'number'; value: number }
  | { type: 'yes-no'; value: boolean }
  | { type: 'none' };

function maintenanceValue({ maintenance }: ItemRecord, signal: 'lastPush' | 'recentCommits'): Measured {
  if (maintenance === undefined) return { type: 'none' };
  return signal === 'lastPush'
    ? { type: 'date', value: maintenance.pushedAt }
    : { type: 'message', value: recentCommitsLabels[maintenance.recentCommits] };
}

/** The value a rubric signal read from the record, mirroring where the scorer reads it. */
export function measuredValue(record: ItemRecord, signal: string): Measured {
  if (signal === 'lastPush' || signal === 'recentCommits') return maintenanceValue(record, signal);
  if (signal === 'license') {
    const { spdx } = record.license;
    return spdx === undefined
      ? { type: 'message', value: licenseWithoutId(record.license) }
      : { type: 'text', value: spdx };
  }
  if (signal === 'safety') return { type: 'flags', value: record.flags };
  const value = record.signals[signal];
  if (value === undefined) return { type: 'none' };
  return typeof value === 'boolean' ? { type: 'yes-no', value } : { type: 'number', value };
}
