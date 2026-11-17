import { z } from 'zod';
import { count, dateTime, kind, semver, sourceId } from './fields.ts';

/** `meta.json`: the only file that changes on a run without upstream changes. */
export const metaFile = z.strictObject({
  schemaVersion: z.literal(1),
  runAt: dateTime,
  license: z.literal('CC0-1.0').describe('The license of the data folder, whose LICENSE file holds its text.'),
  schemaVersions: z.record(kind, z.int().positive()),
  rubricVersions: z.record(kind, semver),
  sources: z.array(z.strictObject({ id: sourceId, readAt: dateTime })),
  stats: z.strictObject({
    requests: count,
    itemsByKind: z.record(kind, count),
    otherSourceKinds: count,
  }),
});
