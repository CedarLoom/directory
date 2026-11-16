import { z } from 'zod';
import { flag, keyword, kind, semver } from './fields.ts';

/** `rubrics/<kind>/<version>.json`: the signals of one kind with their maximum points and the flag penalties. */
export const rubricFile = z.strictObject({
  schemaVersion: z.literal(1),
  kind,
  version: semver,
  signals: z.array(
    z.strictObject({
      id: keyword,
      group: z.enum(['maintenance', 'license', 'quality', 'token-cost', 'safety', 'evals', 'provenance']),
      max: z.number().positive(),
    }),
  ),
  flagPenalties: z.array(z.strictObject({ flag, points: z.number() })),
});
