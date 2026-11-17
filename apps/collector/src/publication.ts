import { count, metaFile, recordContracts, type SourceId, sourceId } from '@directory/contracts';
import { currentRubric } from '@directory/scoring';
import { z } from 'zod';
import { type DataFiles, jsonFile } from './data-files.ts';
import { isExcluded } from './exclusions.ts';
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

// What a record names of the files that belong to it.
const recordLinks = z.looseObject({
  id: z.string(),
  container: z.string().optional(),
  popularity: z.array(z.looseObject({ ref: z.string().optional() })),
});

const fileId = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

/**
 * Published files the run did not produce and drops: the record of every item that left the index, and the history and
 * popularity file of an excluded item. An item that left without an exclusion keeps its history and popularity file, so
 * a return continues them; a popularity file stays while an item that is not excluded points to it.
 */
function removals(candidate: DataFiles, published: DataFiles, excluded: ReadonlySet<string>): string[] {
  const excludedHistories = new Set<string>();
  const [excludedRefs, keptRefs] = [new Set<string>(), new Set<string>()];
  for (const [path, text] of [...published, ...candidate]) {
    if (!path.startsWith('records/')) continue;
    const record = recordLinks.parse(JSON.parse(text));
    const gone = isExcluded(record, excluded);
    if (gone) excludedHistories.add(`history/${path.slice('records/'.length)}`);
    for (const { ref } of record.popularity) if (ref !== undefined) (gone ? excludedRefs : keptRefs).add(ref);
  }
  return [...published.keys()].filter((path) => {
    if (candidate.has(path)) return false;
    if (path.startsWith('records/')) return true;
    // A history whose record an earlier run removed is matched by its id alone.
    if (path.startsWith('history/')) return excludedHistories.has(path) || excluded.has(fileId(path));
    const id = fileId(path);
    return path.startsWith('popularity/') && excludedRefs.has(id) && !keptRefs.has(id);
  });
}

/** What `publish` does to the published data folder. */
export interface Publication {
  /** Each file of the validated run whose text differs from the published one, and `meta.json` with the run time. */
  files: Map<string, string>;
  /** Paths of the published files to remove. */
  removed: string[];
}

/** The files `publish` writes into the published data folder and the ones it removes; any other file stays as it is. */
export function publication(
  candidate: DataFiles,
  published: DataFiles,
  report: RunReport,
  excluded: ReadonlySet<string>,
): Publication {
  const files = [...candidate, ['meta.json', metaText(report, candidate)] as const];
  return {
    files: new Map(files.filter(([path, text]) => published.get(path) !== text)),
    removed: removals(candidate, published, excluded),
  };
}
