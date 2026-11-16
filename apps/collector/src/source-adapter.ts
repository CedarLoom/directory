import type { SourceId } from '@directory/contracts';
import type { Candidate } from './candidate.ts';
import type { HttpClient } from './http-client.ts';

/** How an adapter that keeps a checkpoint read its source; `readAt` is the checkpoint of its next read. */
export interface SourceRead {
  id: SourceId;
  /** Absent when a read that stopped leaves no checkpoint, so the next run reads the whole source. */
  readAt?: string;
  crawl: 'full' | 'incremental';
  /** Why a full crawl ran: no checkpoint or nothing kept from the last run, a data reset, or too many items vanished. */
  reason?: 'no-checkpoint' | 'reset' | 'vanished';
  /** Why the read stopped before its last page; the items and the checkpoint of the last run are kept. */
  stopped?: 'request-cap' | 'request-error';
  /** Items without a GitHub repository to rank them by; they get no record. */
  withoutRepository: number;
  /** Requests sent to this source, which has a client of its own. */
  requests: number;
}

export interface SourceResult {
  candidates: Candidate[];
  /** Entries the contracts refused; each is logged and left out. */
  refused: number;
  read?: SourceRead;
}

/** Reads one source through the client and names its items; it keeps nothing of the source but ids, links and facts. */
export interface SourceAdapter {
  readonly id: SourceId;
  collect(client: HttpClient, log: (line: string) => void): Promise<SourceResult>;
}
