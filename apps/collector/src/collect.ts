import { type Candidate, mergeCandidates } from './candidate.ts';
import { applyExclusions } from './exclusions.ts';
import type { HttpClient } from './http-client.ts';
import type { SourceAdapter } from './source-adapter.ts';

/** The run report the `collect` command prints as JSON. */
export interface RunReport {
  format: 'directory-run-report';
  schemaVersion: 1;
  requests: number;
  refused: number;
  excluded: number;
  counts: Record<Candidate['kind'], number>;
  candidates: Candidate[];
}

// Code unit order, so the report does not depend on the machine's locale.
function byCodeUnits(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function byKindAndId(first: Candidate, second: Candidate): number {
  return byCodeUnits(first.kind, second.kind) || byCodeUnits(first.id, second.id);
}

/** Reads every source, joins the candidates they share and leaves out the excluded ones. */
export async function collect(
  adapters: readonly SourceAdapter[],
  client: HttpClient,
  excluded: ReadonlySet<string>,
  log: (line: string) => void,
): Promise<RunReport> {
  const results = await Promise.all(adapters.map((adapter) => adapter.collect(client, log)));
  const merged = mergeCandidates(results.flatMap((result) => result.candidates));
  const candidates = applyExclusions(merged, excluded).toSorted(byKindAndId);
  const count = (kind: Candidate['kind']) => candidates.filter((candidate) => candidate.kind === kind).length;
  return {
    format: 'directory-run-report',
    schemaVersion: 1,
    requests: client.requests,
    refused: results.reduce((sum, result) => sum + result.refused, 0),
    excluded: merged.length - candidates.length,
    counts: { marketplace: count('marketplace'), plugin: count('plugin'), skill: count('skill') },
    candidates,
  };
}

export function summaryLine({ counts, excluded, refused, requests }: RunReport): string {
  return `collect: dry run, ${counts.plugin} plugin, ${counts.skill} skill and ${counts.marketplace} marketplace candidates; ${excluded} excluded, ${refused} entries refused; ${requests} requests`;
}
