import { z } from 'zod';
import { date } from './fields.ts';

/** `departures.json`: the history and popularity files kept for items that left the index, written by publish. */
export const departuresFile = z.strictObject({
  schemaVersion: z.literal(1),
  files: z
    .record(z.string(), date)
    .describe('Each kept file by its path in the data folder, with the date of the first run without its item.'),
});
