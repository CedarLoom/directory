import { count, departuresFile, metaFile, recordContracts, type SourceId, sourceId } from '@directory/contracts';
import { currentRubric } from '@directory/scoring';
import { z } from 'zod';
import { byCodeUnits } from './code-unit-order.ts';
import { type DataFiles, jsonFile } from './data-files.ts';
import { type Exclusions, isExcluded } from './exclusions.ts';
import { dayMs } from './popularity-file.ts';
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
    license: 'CC0-1.0',
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

/** The id a history or popularity file names in its file name. */
const fileId = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

const popularityRefs = (record: z.infer<typeof recordLinks>) =>
  record.popularity.flatMap(({ ref }) => (ref === undefined ? [] : [ref]));

/** A history file of an excluded item: by its record, or, when an earlier run removed the record, by its own id or its repository's. */
function excludedHistory(path: string, excludedHistories: ReadonlySet<string>, excluded: Exclusions): boolean {
  const id = fileId(path);
  // Every id but an MCP server's starts with the id of its repository, `gh.<owner>.<repo>`.
  const repository = path.startsWith('history/mcp-server/') ? id : id.split('.', 3).join('.');
  return excludedHistories.has(path) || excluded.has(id) || excluded.has(repository);
}

/** The files kept for items that left the index, as `departures.json` lists them. */
type Departures = ReadonlyMap<string, { since: string; ids: string[] }>;

/** Published files the run drops: every record it lacks, the history of an excluded item and the popularity file of an excluded repository. */
function removals(candidate: DataFiles, published: DataFiles, excluded: Exclusions, departed: Departures): string[] {
  const excludedHistories = new Set<string>();
  // The run's copy of a record replaces the published one.
  for (const [path, text] of new Map([...published, ...candidate])) {
    if (!path.startsWith('records/')) continue;
    const record = recordLinks.parse(JSON.parse(text));
    // An excluded repository takes out the items in it, as collect does.
    if (isExcluded(record, excluded) || popularityRefs(record).some((ref) => excluded.has(ref))) {
      excludedHistories.add(`history/${path.slice('records/'.length)}`);
    }
  }
  // A history whose record an earlier run removed is also matched by the ids `departures.json` keeps from it.
  for (const [path, { ids }] of departed) {
    if (path.startsWith('history/') && ids.some((id) => excluded.has(id))) excludedHistories.add(path);
  }
  return [...published.keys()].filter((path) => {
    if (candidate.has(path) || path === 'index.json' || path === 'meta.json') return false;
    if (path.startsWith('records/')) return true;
    if (path.startsWith('history/')) return excludedHistory(path, excludedHistories, excluded);
    // A popularity file holds the star counts of the repository its file name names, which every item in it shares.
    return path.startsWith('popularity/') && excluded.has(fileId(path));
  });
}

/** Days a history or popularity file stays once no item in the index uses it; a return within them continues it. */
const retentionDays = 90;

/** The popularity files the run's records point to, including one the run lacks as it read no star count for it. */
function listedPopularity(candidate: DataFiles): Set<string> {
  const listed = new Set<string>();
  for (const [path, text] of candidate) {
    if (!path.startsWith('records/')) continue;
    for (const ref of popularityRefs(recordLinks.parse(JSON.parse(text)))) listed.add(`popularity/${ref}.json`);
  }
  return listed;
}

/** The published history and popularity files that no item of the run uses and that the run does not remove. */
function keptFiles(candidate: DataFiles, published: DataFiles, removed: ReadonlySet<string>): string[] {
  const listed = listedPopularity(candidate);
  return [...published.keys()]
    .filter(
      (path) =>
        /^(?:history|popularity)\//.test(path) && !candidate.has(path) && !removed.has(path) && !listed.has(path),
    )
    .toSorted(byCodeUnits);
}

/** The container and repository, read from its published record, of each item the run drops from the index, by its history file. */
function leavingIds(candidate: DataFiles, published: DataFiles): Map<string, string[]> {
  const ids = new Map<string, string[]>();
  for (const [path, text] of published) {
    if (!path.startsWith('records/') || candidate.has(path)) continue;
    const record = recordLinks.parse(JSON.parse(text));
    const containers = record.container === undefined ? [] : [record.container];
    const values = new Set([...containers, ...popularityRefs(record)]);
    ids.set(`history/${path.slice('records/'.length)}`, [...values].toSorted(byCodeUnits));
  }
  return ids;
}

/**
 * The history and popularity files that no item in the index uses, each with the date of the first run in which none
 * used it and the ids that exclude it, and the kept files whose retention period ended by the run date.
 */
function departures(
  candidate: DataFiles,
  published: DataFiles,
  { removed, departed, runDate }: { removed: ReadonlySet<string>; departed: Departures; runDate: string },
) {
  const leaving = leavingIds(candidate, published);
  const kept = new Map<string, { since: string; ids: string[] }>();
  const expired: string[] = [];
  for (const path of keptFiles(candidate, published, removed)) {
    // A popularity file, which only its own id excludes, and a history kept with no record to read have no ids.
    const entry = departed.get(path) ?? { since: runDate, ids: leaving.get(path) ?? [] };
    if (Date.parse(runDate) - Date.parse(entry.since) >= retentionDays * dayMs) expired.push(path);
    else kept.set(path, entry);
  }
  const file = departuresFile.parse({ schemaVersion: 1, files: Object.fromEntries(kept) });
  return { text: jsonFile(file), expired };
}

/** What `publish` does to the published data folder. */
export interface Publication {
  /** Each file of the validated run whose text differs from the published one, and `meta.json` with the run time. */
  files: Map<string, string>;
  /** Paths of the published files to remove: those the run drops and those past their retention period. */
  removed: string[];
}

/**
 * The files `publish` writes into the published data folder, with `meta.json`, `departures.json` and the license text as
 * `LICENSE`, and the ones it removes; any other file stays as it is.
 */
export function publication(
  candidate: DataFiles,
  published: DataFiles,
  report: RunReport,
  { excluded, license }: { excluded: Exclusions; license: string },
): Publication {
  const before = published.get('departures.json');
  const departed = new Map(Object.entries(before === undefined ? {} : departuresFile.parse(JSON.parse(before)).files));
  const dropped = removals(candidate, published, excluded, departed);
  const { text: departuresText, expired } = departures(candidate, published, {
    removed: new Set(dropped),
    departed,
    runDate: report.runAt.slice(0, 10),
  });
  const files = [
    ...candidate,
    ['meta.json', metaText(report, candidate)] as const,
    ['departures.json', departuresText] as const,
    ['LICENSE', license] as const,
  ];
  return {
    files: new Map(files.filter(([path, text]) => published.get(path) !== text)),
    removed: [...dropped, ...expired],
  };
}
