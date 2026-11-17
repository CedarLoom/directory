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

/** The items of an index by kind and id, as two kinds may share an id. */
function indexItems(text: string): Set<string> {
  return new Set(indexFile.parse(JSON.parse(text)).items.map((item) => `${item.kind}/${item.id}`));
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
  return released !== undefined && path.startsWith('records/') ? rubricRefusal(path, parsed.data, released) : undefined;
}

function vanishedRefusal({ candidate, publishedIndex: before }: RunFiles): string | undefined {
  const after = candidate.get('index.json');
  if (after === undefined) return 'index.json: missing';
  if (before === undefined) return undefined;
  const [beforeIds, afterIds] = [indexItems(before), indexItems(after)];
  const vanished = [...beforeIds].filter((id) => !afterIds.has(id)).length;
  return vanished > beforeIds.size * vanishedShare
    ? `index.json: ${vanished} of ${beforeIds.size} published items vanished, more than ${vanishedShare * 100} percent`
    : undefined;
}

/** Why the run must not be published: every file that breaks its contract or size cap, too many vanished items, or rubric files that differ from their lock; empty when the run holds. */
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
  const vanished = vanishedRefusal(files);
  if (vanished !== undefined) refusals.push(vanished);
  return refusals;
}
