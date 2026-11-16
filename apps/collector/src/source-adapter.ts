import type { SourceId } from '@directory/contracts';
import type { Candidate } from './candidate.ts';
import type { HttpClient } from './http-client.ts';

export interface SourceResult {
  candidates: Candidate[];
  /** Entries the contracts refused; each is logged and left out. */
  refused: number;
}

/** Reads one source through the client and names its items; it keeps nothing of the source but ids, links and facts. */
export interface SourceAdapter {
  readonly id: SourceId;
  collect(client: HttpClient, log: (line: string) => void): Promise<SourceResult>;
}
