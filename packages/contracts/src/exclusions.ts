import { z } from 'zod';
import { itemId } from './fields.ts';

/** `curation/exclusions.json`: ids the collector leaves out, with every item whose container is one of them. */
export const exclusionsFile = z.strictObject({
  schemaVersion: z.literal(1),
  ids: z.array(itemId),
});
