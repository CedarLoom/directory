import type { HistoryFile, ItemRecord, Kind, PopularityFile, Rubric } from './data-types.ts';
import { loadRubric } from './method/rubrics.ts';

// Lazy globs: Vite emits one chunk per file, so an item page loads its own record only.
const records = import.meta.glob<ItemRecord>('/data/v1/records/*/*.json', { import: 'default' });
const histories = import.meta.glob<HistoryFile>('/data/v1/history/*/*.json', { import: 'default' });
const popularity = import.meta.glob<PopularityFile>('/data/v1/popularity/*.json', { import: 'default' });

export interface Item {
  record: ItemRecord;
  history: HistoryFile | undefined;
  popularity: PopularityFile | undefined;
  /** The rubric that scored the record. */
  rubric: Rubric | undefined;
}

/** The record of an item with its score history, star snapshots and scoring rubric; undefined for an id the data does not hold. */
export async function loadItem(kind: Kind, id: string): Promise<Item | undefined> {
  const loadRecord = records[`/data/v1/records/${kind}/${id}.json`];
  if (loadRecord === undefined) return undefined;
  const record = await loadRecord();
  const starsRef = record.popularity.find((entry) => entry.signal === 'stars');
  const scoredBy = record.score?.rubric;
  const [history, stars, rubric] = await Promise.all([
    histories[`/data/v1/history/${kind}/${id}.json`]?.(),
    starsRef === undefined || !('ref' in starsRef)
      ? undefined
      : popularity[`/data/v1/popularity/${starsRef.ref}.json`]?.(),
    scoredBy === undefined ? undefined : loadRubric(scoredBy.kind, scoredBy.version),
  ]);
  return { record, history, popularity: stars, rubric };
}
