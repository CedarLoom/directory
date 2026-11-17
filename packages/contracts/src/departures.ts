import { z } from 'zod';
import { date, itemId } from './fields.ts';

/** `departures.json`: the history and popularity files kept while no item in the index uses them, written by publish. */
export const departuresFile = z.strictObject({
  schemaVersion: z.literal(1),
  files: z
    .record(
      z.string(),
      z.strictObject({
        since: date.describe('The date of the first published run in which no item in the index used the file.'),
        ids: z
          .array(itemId)
          .describe(
            'The ids besides the one in the file name whose exclusion removes the file: for a history file the container and repository of its item, taken from its record; none for a popularity file, which only the exclusion of its repository removes.',
          ),
      }),
    )
    .describe('Each kept file by its path in the data folder.'),
});
