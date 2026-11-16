import { z } from 'zod';
import { count, date, itemId } from './fields.ts';

/** `popularity/<repo-id>.json`: the star counts of one repository, shared by every item in it. */
export const popularityFile = z.strictObject({
  schemaVersion: z.literal(1),
  id: itemId,
  snapshots: z
    .array(z.strictObject({ date, stars: count }))
    .describe(
      'Oldest first, at most one per week, dated the Monday of its week; a run writes an entry only when the count differs from the last one.',
    ),
});
export type PopularityFile = z.infer<typeof popularityFile>;
