import { z } from 'zod';
import { count, dateTime, fitLabel, itemId, itemName, kind, licenseClass, registryName, tag } from './fields.ts';

const row = z.strictObject({
  id: itemId,
  kind,
  name: itemName,
  owner: itemName.optional(),
  score: z.number().min(0).max(100).optional(),
  stars: count.optional(),
  starsGained30d: z
    .int()
    .optional()
    .describe(
      'Current stars minus the newest snapshot 30 or more days before the run date; negative when unstars outweigh stars; absent while no snapshot is that old.',
    ),
  licenseClass: z
    .enum([...licenseClass.options, 'withheld'])
    .describe('The class of the license; `withheld` where the license field of the item withholds the license.'),
  fit: fitLabel,
  listedOfficial: z.boolean(),
  pushedAt: dateTime.optional(),
  archived: z.boolean(),
  flagCount: count,
  tags: z.array(tag),
});

/** `index.json`: one compact row per item for the list page. */
export const indexFile = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(
    // An MCP server keeps its registry name, which may be longer than the names of the other kinds.
    z.discriminatedUnion('kind', [
      row.extend({ kind: z.literal('mcp-server'), name: registryName }),
      row.extend({ kind: kind.exclude(['mcp-server']) }),
    ]),
  ),
});
