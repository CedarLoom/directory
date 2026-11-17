import { dataFileContract, indexFile, kind, semver } from '@directory/contracts';
import { lockedRubrics } from '@directory/scoring';
import { z } from 'zod';
import type { DataFiles } from './data-files.ts';
import { issueSummary } from './issue-summary.ts';
import { jsonText } from './json-text.ts';

/** What `validate` checks: the files a run produced against the published ones and the released rubrics. */
export interface RunFiles {
  /** The data files the run produced, by path relative to the data folder. */
  candidate: DataFiles;
  /** `index.json` of the last published run; undefined before the first. */
  publishedIndex: string | undefined;
  /** The rubric files by path under `rubrics/`, without `lock.json`. */
  rubrics: Readonly<Record<string, unknown>>;
  /** The parsed `rubrics/lock.json`. */
  lock: unknown;
}

// Bytes per file: a record, history or popularity file is a few kilobytes, the index of 500 items a few hundred.
const fileCap = 64 * 1024;
const indexCap = 2 * 1024 * 1024;
// More vanished items than this share of the published ones points to a broken source, not to upstream removals.
const vanishedShare = 0.2;

const scoredRecord = z.looseObject({
  score: z.looseObject({ rubric: z.looseObject({ kind, version: semver }) }).optional(),
});

// Only kind and id: a published index written under an older contract still names its items.
const indexRows = z.looseObject({ items: z.array(z.looseObject({ kind: z.string(), id: z.string() })) });
// Every record, history and popularity file names its own id, and records and histories their kind.
const fileIdentity = z.looseObject({ kind: z.string().optional(), id: z.string() });

interface IndexRow {
  kind: string;
  id: string;
}

const itemKey = (item: IndexRow) => `${item.kind}/${item.id}`;

/** The path a record, history or popularity file belongs at by its own kind and id. */
function ownPath(path: string, data: unknown): string {
  const { kind: fileKind, id } = fileIdentity.parse(data);
  const folder = path.slice(0, path.indexOf('/'));
  return fileKind === undefined ? `${folder}/${id}.json` : `${folder}/${fileKind}/${id}.json`;
}

function rubricRefusal(path: string, record: unknown, released: ReadonlySet<string>): string | undefined {
  const rubric = scoredRecord.parse(record).score?.rubric;
  return rubric === undefined || released.has(`${rubric.kind}/${rubric.version}.json`)
    ? undefined
    : `${path}: scored with rubric ${rubric.kind} ${rubric.version}, which is not released`;
}

/** The reason to refuse one file of the run, or undefined when it holds. */
function fileRefusal(path: string, text: string, released: ReadonlySet<string> | undefined): string | undefined {
  const bytes = Buffer.byteLength(text);
  const cap = path === 'index.json' ? indexCap : fileCap;
  if (bytes > cap) return `${path}: ${bytes} bytes, over the cap of ${cap}`;
  if (path === 'meta.json') return `${path}: written by publish, never by a run`;
  const contract = dataFileContract(path);
  if (contract === undefined) return `${path}: not a file of the data layout`;
  const parsed = jsonText.pipe(contract).safeParse(text);
  if (!parsed.success) return `${path}: ${issueSummary(parsed.error, 'value')}`;
  if (path === 'index.json') return undefined;
  const own = ownPath(path, parsed.data);
  if (own !== path) return `${path}: its kind and id belong at ${own}`;
  return released !== undefined && path.startsWith('records/') ? rubricRefusal(path, parsed.data, released) : undefined;
}

/** Index rows whose record file the run did not produce: their pages would have nothing to show. */
function listingRefusals(items: readonly IndexRow[], candidate: DataFiles): string[] {
  return items
    .filter((item) => !candidate.has(`records/${itemKey(item)}.json`))
    .map((item) => `index.json: ${itemKey(item)} has no record`);
}

/** Refuses a run that lost more than the vanished share of the published items, or every item of a published kind. */
function vanishedRefusals(items: readonly IndexRow[], publishedIndex: string | undefined): string[] {
  if (publishedIndex === undefined) return [];
  const published = indexRows.parse(JSON.parse(publishedIndex)).items;
  const [before, after] = [new Set(published.map(itemKey)), new Set(items.map(itemKey))];
  const vanished = [...before].filter((key) => !after.has(key)).length;
  const refusals =
    vanished > before.size * vanishedShare
      ? [`index.json: ${vanished} of ${before.size} published items vanished, more than ${vanishedShare * 100} percent`]
      : [];
  // Collect refuses items one by one, so a source that changed its format can empty a kind well under that share.
  const kinds = new Set(items.map((item) => item.kind));
  for (const gone of new Set(published.map((item) => item.kind)).difference(kinds)) {
    const count = [...before].filter((key) => key.startsWith(`${gone}/`)).length;
    refusals.push(`index.json: all ${count} published ${gone} items vanished`);
  }
  return refusals;
}

/** Why the run must not be published: every file that breaks its contract, size cap or path, an index row without its record, too many vanished items or a vanished kind, or rubric files that differ from their lock; empty when the run holds. */
export function runRefusals(files: RunFiles): string[] {
  const refusals: string[] = [];
  let released: Set<string> | undefined;
  try {
    released = new Set(
      lockedRubrics(files.rubrics, files.lock).map((rubric) => `${rubric.kind}/${rubric.version}.json`),
    );
  } catch (error) {
    // lockedRubrics throws a plain Error for a rubric file that breaks the lock; anything else is a fault.
    if (!(error instanceof Error) || error.constructor !== Error) throw error;
    refusals.push(error.message);
  }
  for (const [path, text] of files.candidate) {
    const refusal = fileRefusal(path, text, released);
    if (refusal !== undefined) refusals.push(refusal);
  }
  const indexText = files.candidate.get('index.json');
  if (indexText === undefined) return [...refusals, 'index.json: missing'];
  // A candidate index against its contract has its refusal above; the checks that read it need a valid one.
  const index = jsonText.pipe(indexFile).safeParse(indexText);
  if (!index.success) return refusals;
  return [
    ...refusals,
    ...listingRefusals(index.data.items, files.candidate),
    ...vanishedRefusals(index.data.items, files.publishedIndex),
  ];
}
