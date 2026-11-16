import { z } from 'zod';
import { count, dateTime, kind, semver, sourceId } from './fields.ts';

/** `meta.json`: the only file that changes on a run without upstream changes. */
export const metaFile = z.strictObject({
  schemaVersion: z.literal(1),
  runAt: dateTime,
  schemaVersions: z.record(kind, z.int().positive()),
  rubricVersions: z.record(kind, semver),
  sources: z.array(z.strictObject({ id: sourceId, readAt: dateTime })),
  stats: z.strictObject({
    requests: count,
    itemsByKind: z.record(kind, count),
    otherSourceKinds: count,
  }),
});
