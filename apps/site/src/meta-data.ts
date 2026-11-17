import type { MetaFile } from './data-types.ts';

const [meta] = Object.values(import.meta.glob<MetaFile>('/data/v1/meta.json', { eager: true, import: 'default' }));
if (meta === undefined) throw new Error('data/v1/meta.json is missing');

/** The run that wrote the data. */
export const runMeta: MetaFile = meta;
