import { count, dateTime, kind, sourceId } from '@directory/contracts';
import { z } from 'zod';

/** How an adapter that keeps a checkpoint read its source; `readAt` is the checkpoint of its next read. */
const sourceRead = z.strictObject({
  id: sourceId,
  /** Absent when a read that stopped leaves no checkpoint, so the next run reads the whole source. */
  readAt: dateTime.optional(),
  crawl: z.enum(['full', 'incremental']),
  /** Why a full crawl ran: no checkpoint or nothing kept from the last run, a data reset, or too many items vanished. */
  reason: z.enum(['no-checkpoint', 'reset', 'vanished']).optional(),
  /** Why the read stopped before its last page; the items and the checkpoint of the last run are kept. */
  stopped: z.enum(['request-cap', 'request-error']).optional(),
  /** Items without a GitHub repository to rank them by; they get no record. */
  withoutRepository: count,
  /** Requests sent to this source, which has a client of its own. */
  requests: count,
});

export type SourceRead = z.infer<typeof sourceRead>;

const byKind = z.record(kind, count);

/** The run report the `collect` command prints as JSON; `validate` and `publish` read it back. */
export const runReport = z.strictObject({
  format: z.literal('directory-run-report'),
  schemaVersion: z.literal(4),
  /** The run's start; its date is the run date. */
  runAt: dateTime,
  /** Requests to GitHub and the MCP Registry, retries included. */
  requests: count,
  refused: count,
  excluded: count,
  /** Candidates the sources and inspections named, after exclusions. */
  discovered: byKind,
  /** Records built. */
  items: byKind,
  /** How each source with a checkpoint was read; the publishing step keeps `readAt` in `meta.json`. */
  sources: z.array(sourceRead),
});

export type RunReport = z.infer<typeof runReport>;
