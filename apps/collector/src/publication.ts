import { count, metaFile, recordContracts, type SourceId, sourceId } from '@directory/contracts';
import { currentRubric } from '@directory/scoring';
import { z } from 'zod';
import { type DataFiles, jsonFile } from './data-files.ts';
import type { RunReport } from './run-report.ts';

const recordFacts = z.looseObject({
  provenance: z.array(sourceId),
  sourceKinds: z.looseObject({ other: count }).optional(),
});

/** The sources the run's records come from, each with its read time: a source with a checkpoint keeps it, as the next run reads from there. */
function sourcesRead(report: RunReport, provenance: ReadonlySet<SourceId>) {
  const checkpoints = new Map(report.sources.map(({ id, readAt }) => [id, readAt]));
  return sourceId.options.flatMap((id) => {
    // A checkpointed read that stopped without a checkpoint leaves the source out, so the next run reads all of it.
    const readAt = checkpoints.has(id) ? checkpoints.get(id) : report.runAt;
    return provenance.has(id) && readAt !== undefined ? [{ id, readAt }] : [];
  });
}

/** `meta.json` of the run: its time, the schema and rubric versions, the sources read and the run statistics. */
function metaText(report: RunReport, candidate: DataFiles): string {
  const provenance = new Set<SourceId>();
  let otherSourceKinds = 0;
  for (const [path, text] of candidate) {
    if (!path.startsWith('records/')) continue;
    const facts = recordFacts.parse(JSON.parse(text));
    for (const source of facts.provenance) provenance.add(source);
    otherSourceKinds += facts.sourceKinds?.other ?? 0;
  }
  const kinds = Object.entries(recordContracts);
  const meta = metaFile.parse({
    schemaVersion: 1,
    runAt: report.runAt,
    schemaVersions: Object.fromEntries(kinds.map(([kind, contract]) => [kind, contract.shape.schemaVersion.value])),
    rubricVersions: Object.fromEntries(
      kinds.map(([kind, contract]) => [kind, currentRubric(contract.shape.kind.value).version]),
    ),
    sources: sourcesRead(report, provenance),
    stats: { requests: report.requests, itemsByKind: report.items, otherSourceKinds },
  });
  return jsonFile(meta);
}

/**
 * The files `publish` writes into the published data folder: each file of the validated run whose text differs from the
 * published one, and `meta.json` with the run time. A file the run did not produce stays as it is.
 */
export function publication(candidate: DataFiles, published: DataFiles, report: RunReport): Map<string, string> {
  const files = [...candidate, ['meta.json', metaText(report, candidate)] as const];
  return new Map(files.filter(([path, text]) => published.get(path) !== text));
}
