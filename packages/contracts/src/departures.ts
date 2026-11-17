import { z } from 'zod';
import { date, itemId } from './fields.ts';

/** `departures.json`: the history and popularity files kept for items that left the index, written by publish. */
export const departuresFile = z.strictObject({
  schemaVersion: z.literal(1),
  files: z
    .record(
      z.string(),
      z.strictObject({
        since: date.describe('The date of the first run without the item.'),
        ids: z
          .array(itemId)
          .describe(
            'The ids besides the one in the file name whose exclusion removes the file, taken from the records of the items that left: for a history file the container and repository of its item, for a popularity file the items that pointed to it and their containers.',
          ),
      }),
    )
    .describe('Each kept file by its path in the data folder.'),
});
