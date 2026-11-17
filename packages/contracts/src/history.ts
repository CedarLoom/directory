import { z } from 'zod';
import { date, itemId, kind, semver } from './fields.ts';

/** `history/<kind>/<id>.json`: one entry per change of the rounded total or the rubric version, oldest first. */
export const historyFile = z.strictObject({
  schemaVersion: z.literal(1),
  id: itemId,
  kind,
  entries: z.array(
    z.strictObject({
      date,
      rubric: semver,
      total: z.int().min(0).max(100).describe('The score total rounded to an integer.'),
    }),
  ),
});

export type HistoryFile = z.infer<typeof historyFile>;
