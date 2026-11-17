import type { IndexFile, Row } from './data-types.ts';

// An eager glob, so the list route's chunk carries the rows and the page makes no data request.
const [index] = Object.values(import.meta.glob<IndexFile>('/data/v1/index.json', { eager: true, import: 'default' }));
if (index === undefined) throw new Error('data/v1/index.json is missing');

export const rows: readonly Row[] = index.items;
