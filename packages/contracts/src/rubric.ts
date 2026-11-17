import { z } from 'zod';
import { count, flag, keyword, kind, semver, share } from './fields.ts';

// Each scale maps one measurement to a share of the signal's maximum points.
const scale = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal('push-age'),
      steps: z
        .array(z.strictObject({ days: count, share }))
        .min(1)
        .refine((steps) => steps.every((step, index) => index === 0 || step.days > (steps[index - 1]?.days ?? 0)), {
          message: 'step days ascend',
        }),
    })
    .describe(
      'Days from `maintenance.pushedAt` to the run date; the share of the first step whose `days` is not exceeded, 0 past the last.',
    ),
  z
    .strictObject({
      type: z.literal('recent-commits'),
      levels: z.strictObject({ none: share, '1-4': share, '5+': share }),
    })
    .describe('`maintenance.recentCommits`; no maintenance facts give 0.'),
  z
    .strictObject({
      type: z.literal('license'),
      levels: z.strictObject({
        permissive: share,
        copyleft: share,
        'source-available': share,
        custom: share,
        none: share,
      }),
    })
    .describe(
      '`license.class`; `custom` is class `none` with a license the item states: one no SPDX id names, or an SPDX id or expression of no known class; a withheld license (`license.withheld`) is `none`.',
    ),
  z
    .strictObject({ type: z.literal('flags') })
    .describe("The maximum minus the `flagPenalties` of the record's flags, between 0 and the maximum."),
  z.strictObject({ type: z.literal('present') }).describe('A boolean in `signals`: true gives the maximum.'),
  z
    .strictObject({ type: z.literal('linear'), full: z.number(), zero: z.number() })
    .refine(({ full, zero }) => full !== zero, 'full and zero differ')
    .describe('A number in `signals`: the maximum at `full`, 0 at `zero`, linear between them.'),
  z
    .strictObject({ type: z.literal('within'), min: z.number(), max: z.number().optional() })
    .describe('A number in `signals`: the maximum between `min` and `max`, both included, else 0.'),
]);

const group = z.enum(['maintenance', 'license', 'quality', 'token-cost', 'safety', 'evals', 'provenance']);

/** `rubrics/<kind>/<version>.json`: the signals of one kind with their maximum points, scales and the flag penalties. */
export const rubricFile = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind,
    version: semver,
    signals: z
      .array(
        z.strictObject({
          id: keyword,
          group,
          max: z.number().positive(),
          scale,
          gate: keyword
            .optional()
            .describe('A signal of the record that must be true or above 0, else the signal gives 0.'),
        }),
      )
      .min(1),
    flagPenalties: z.array(z.strictObject({ flag, points: z.number() })),
  })
  .refine(({ signals }) => new Set(signals.map(({ id }) => id)).size === signals.length, 'signal ids are unique')
  .refine(
    // Points are kept in hundredths, so the sum is compared in them.
    ({ signals }) => Math.round(signals.reduce((sum, { max }) => sum + max, 0) * 100) === 10_000,
    'the maximum points add up to 100',
  )
  .refine(
    ({ signals, flagPenalties }) =>
      flagPenalties.length === 0 || signals.some(({ scale: { type } }) => type === 'flags'),
    'flag penalties need a flags signal',
  );

export type Rubric = z.infer<typeof rubricFile>;
