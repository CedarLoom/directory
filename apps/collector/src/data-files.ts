import { isDeepStrictEqual } from 'node:util';
import { historyFile, indexFile, type PopularityFile, popularityFile } from '@directory/contracts';
import { nextHistory } from '@directory/scoring';
import { z } from 'zod';
import { byCodeUnits } from './code-unit-order.ts';
import { officialMarketplace } from './item-signals.ts';
import { starsGained30d, withSnapshot } from './popularity-file.ts';
import type { ItemRecord } from './records.ts';
import type { RepositoryFacts } from './repository-facts.ts';

/** Published data files by path relative to the data folder; every file is written by the collector itself. */
export type DataFiles = ReadonlyMap<string, string>;

export function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The previous text when only `changedAt` would differ, so a run without upstream changes rewrites no record. */
function recordText(record: ItemRecord, previous: string | undefined): string {
  if (previous !== undefined) {
    const before = z.looseObject({ changedAt: z.string() }).parse(JSON.parse(previous));
    if (isDeepStrictEqual(before, { ...record.value, changedAt: before.changedAt })) return previous;
  }
  return jsonFile(record.value);
}

/** The previous text while the history gains no entry, else the history with the record's score added. */
function historyText({ kind, id, value }: ItemRecord, previous: string | undefined, runDate: string): string {
  const entries = previous === undefined ? [] : historyFile.parse(JSON.parse(previous)).entries;
  const next = nextHistory(entries, value.score, runDate);
  if (previous !== undefined && next === entries) return previous;
  return jsonFile(historyFile.parse({ schemaVersion: 1, id, kind, entries: next }));
}

interface Popularity {
  stars: number;
  gained?: number;
}

function popularityFiles(
  repositories: ReadonlySet<string>,
  facts: ReadonlyMap<string, RepositoryFacts>,
  previous: DataFiles,
  runDate: string,
) {
  const files = new Map<string, string>();
  const popularity = new Map<string, Popularity>();
  for (const repository of repositories) {
    const stars = facts.get(repository)?.stars;
    if (stars === undefined) continue;
    const path = `popularity/${repository}.json`;
    const text = previous.get(path);
    const before: PopularityFile | undefined = text === undefined ? undefined : popularityFile.parse(JSON.parse(text));
    const after = withSnapshot(before, repository, stars, runDate);
    files.set(path, after === before && text !== undefined ? text : jsonFile(after));
    const gained = starsGained30d(after, stars, runDate);
    popularity.set(repository, { stars, ...(gained === undefined ? {} : { gained }) });
  }
  return { files, popularity };
}

function indexRow({ value, owner }: ItemRecord, popularity: Popularity | undefined) {
  return {
    id: value.id,
    kind: value.kind,
    name: value.name,
    owner,
    score: value.score.total,
    ...(popularity === undefined ? {} : { stars: popularity.stars }),
    ...(popularity?.gained === undefined ? {} : { starsGained30d: popularity.gained }),
    licenseClass: value.license.withheld === true ? 'withheld' : value.license.class,
    fit: value.cedarloomFit.label,
    listedOfficial: value.listedIn.includes(officialMarketplace),
    ...(value.maintenance === undefined ? {} : { pushedAt: value.maintenance.pushedAt }),
    archived: value.maintenance?.archived ?? false,
    // The official listing is a flag that adds points, shown as listedOfficial rather than counted as a concern.
    flagCount: value.flags.filter((flag) => flag !== 'listed-official-marketplace').length,
    tags: value.tags,
  };
}

/** The record and history files, the popularity file of each repository the records point to, and index.json. */
export function dataFiles(
  records: readonly ItemRecord[],
  facts: ReadonlyMap<string, RepositoryFacts>,
  previous: DataFiles,
  runDate: string,
): Map<string, string> {
  const sorted = records.toSorted(
    (first, second) => byCodeUnits(first.kind, second.kind) || byCodeUnits(first.id, second.id),
  );
  const files = new Map<string, string>();
  for (const record of sorted) {
    const path = `records/${record.kind}/${record.id}.json`;
    files.set(path, recordText(record, previous.get(path)));
    const history = `history/${record.kind}/${record.id}.json`;
    files.set(history, historyText(record, previous.get(history), runDate));
  }
  const repositories = new Set(sorted.map((record) => record.repository));
  const { files: popularity, popularity: counts } = popularityFiles(repositories, facts, previous, runDate);
  const index = indexFile.parse({
    schemaVersion: 1,
    items: sorted.map((record) => indexRow(record, counts.get(record.repository))),
  });
  return new Map([...files, ...popularity, ['index.json', jsonFile(index)]]);
}
