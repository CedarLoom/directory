import { z } from 'zod';
import { count, dateTime, fitLabel, itemId, itemName, kind, licenseClass, tag } from './fields.ts';

/** `index.json`: one compact row per item for the list page. */
export const indexFile = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(
    z.strictObject({
      id: itemId,
      kind,
      name: itemName,
      owner: itemName.optional(),
      score: z.number().min(0).max(100),
      stars: count.optional(),
      licenseClass,
      fit: fitLabel,
      listedOfficial: z.boolean(),
      pushedAt: dateTime.optional(),
      archived: z.boolean(),
      flagCount: count,
      tags: z.array(tag),
    }),
  ),
});
