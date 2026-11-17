import type { HistoryFile, ItemRecord, Kind, PopularityFile } from './data-types.ts';

// Lazy globs: Vite emits one chunk per file, so an item page loads its own record only.
const records = import.meta.glob<ItemRecord>('/data/v1/records/*/*.json', { import: 'default' });
const histories = import.meta.glob<HistoryFile>('/data/v1/history/*/*.json', { import: 'default' });
const popularity = import.meta.glob<PopularityFile>('/data/v1/popularity/*.json', { import: 'default' });

export interface Item {
  record: ItemRecord;
  history: HistoryFile | undefined;
  popularity: PopularityFile | undefined;
}

/** The record of an item with its score history and star snapshots; undefined for an id the data does not hold. */
export async function loadItem(kind: Kind, id: string): Promise<Item | undefined> {
  const loadRecord = records[`/data/v1/records/${kind}/${id}.json`];
  if (loadRecord === undefined) return undefined;
  const record = await loadRecord();
  const starsRef = record.popularity.find((entry) => entry.signal === 'stars');
  const [history, stars] = await Promise.all([
    histories[`/data/v1/history/${kind}/${id}.json`]?.(),
    starsRef === undefined || !('ref' in starsRef)
      ? undefined
      : popularity[`/data/v1/popularity/${starsRef.ref}.json`]?.(),
  ]);
  return { record, history, popularity: stars };
}
