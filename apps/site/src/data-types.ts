import type { HistoryFile, ItemRecord, indexFile, metaFile, PopularityFile, Rubric } from '@directory/contracts';
import type { z } from 'zod';

// Types only: the build validates the data files, so the bundle ships no schema code.

export type IndexFile = z.infer<typeof indexFile>;
export type Row = IndexFile['items'][number];
export type Kind = Row['kind'];
export type LicenseClass = Row['licenseClass'];
export type MetaFile = z.infer<typeof metaFile>;
export type Flag = ItemRecord['flags'][number];
export type RecentCommits = NonNullable<ItemRecord['maintenance']>['recentCommits'];
export type { HistoryFile, ItemRecord, PopularityFile, Rubric };

/** Maintenance as the list filters it: a push in the 90 days before the run date counts as active. */
export type Maintenance = 'active' | 'inactive' | 'archived' | 'unknown';
