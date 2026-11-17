import type { z } from 'zod';
import { departuresFile } from './departures.ts';
import { itemId, kind } from './fields.ts';
import { historyFile } from './history.ts';
import {
  agentRecord,
  hookRecord,
  marketplaceRecord,
  mcpServerRecord,
  outputStyleRecord,
  pluginRecord,
  skillRecord,
} from './item.ts';
import { indexFile } from './listing.ts';
import { metaFile } from './meta.ts';
import { popularityFile } from './popularity.ts';

/** The record contract of each kind. */
export const recordContracts = {
  marketplace: marketplaceRecord,
  plugin: pluginRecord,
  skill: skillRecord,
  agent: agentRecord,
  hook: hookRecord,
  'mcp-server': mcpServerRecord,
  'output-style': outputStyleRecord,
} as const;

const layoutPath = /^(?:(records|history)\/([^/]+)|popularity)\/([^/]+)\.json$/;

/**
 * The contract of a file of the data folder by its path relative to the folder, such as `records/<kind>/<id>.json`;
 * undefined for a path outside the layout.
 */
export function dataFileContract(path: string): z.ZodType | undefined {
  if (path === 'index.json') return indexFile;
  if (path === 'meta.json') return metaFile;
  if (path === 'departures.json') return departuresFile;
  const [, folder, folderKind, id] = layoutPath.exec(path) ?? [];
  if (!itemId.safeParse(id).success) return undefined;
  if (folder === undefined) return popularityFile;
  const parsed = kind.safeParse(folderKind);
  if (!parsed.success) return undefined;
  return folder === 'records' ? recordContracts[parsed.data] : historyFile;
}
