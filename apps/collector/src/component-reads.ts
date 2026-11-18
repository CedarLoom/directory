import { z } from 'zod';
import { queryEach } from './github-graphql.ts';
import type { GitHubLocation } from './github-location.ts';
import type { HttpClient } from './http-client.ts';
import { blob, expression, fileRead } from './repository-tree.ts';

// Third-party file text stays in memory: it is parsed for facts and never written.

/** What a plugin's component locations hold, by path relative to the plugin folder. */
export interface ComponentReads {
  /** The files of each folder location, by path relative to it, three levels deep; a location that is a file holds its own name. */
  files: ReadonlyMap<string, readonly string[]>;
  /** The text of each configuration file the manifest names. */
  texts: ReadonlyMap<string, string>;
}

/** The component folders and configuration files of one plugin to read. */
export interface ComponentTargets {
  location: GitHubLocation;
  folders: readonly string[];
  texts: readonly string[];
}

interface TreeEntry {
  name: string;
  type: 'blob' | 'tree' | 'commit';
  object?: { entries?: TreeEntry[] | undefined } | null | undefined;
}

const treeEntry: z.ZodType<TreeEntry> = z.object({
  name: z.string(),
  type: z.enum(['blob', 'tree', 'commit']),
  get object() {
    return z
      .object({ entries: z.array(treeEntry).optional() })
      .nullable()
      .optional();
  },
});
// A blob read without fields is an empty object; a missing path is null.
const folderAnswer = z.object({ path: z.object({ entries: z.array(treeEntry).optional() }).nullable() }).nullable();
const textAnswer = z.object({ path: blob }).nullable();

const folderFragment = (depth: number): string =>
  depth === 0 ? '' : `entries { name type object { ... on Tree { ${folderFragment(depth - 1)} } } }`;

function blobPaths(entries: readonly TreeEntry[], prefix: string): string[] {
  return entries.flatMap(({ name, type, object }) => {
    if (type === 'blob') return [`${prefix}${name}`];
    return type === 'tree' ? blobPaths(object?.entries ?? [], `${prefix}${name}/`) : [];
  });
}

type Target = { location: GitHubLocation; path: string };

function read(client: HttpClient, targets: readonly Target[], text: boolean): Promise<unknown[]> {
  // Three levels hold a command or agent two subfolders down and a skill folder's SKILL.md.
  const selection = text ? '... on Blob { text isTruncated }' : `... on Tree { ${folderFragment(3)} }`;
  return queryEach(client, targets, {
    name: text ? 'ComponentFiles' : 'ComponentFolders',
    variables: { owner: 'String!', name: 'String!', path: 'String!' },
    field: (variable) =>
      `repository(owner: ${variable('owner')}, name: ${variable('name')}) { path: object(expression: ${variable('path')}) { ${selection} } }`,
    values: ({ location, path }) => ({ owner: location.owner, name: location.repo, path: expression(location, path) }),
    fragments: '',
    batchSize: 25,
  });
}

/**
 * Reads the component folders and configuration files of each plugin, 25 to a query; a plugin with a file that GitHub
 * cuts or that passes the size cap gives 'too-large', so no record is built from part of it.
 */
export async function readComponents(
  client: HttpClient,
  plugins: readonly ComponentTargets[],
): Promise<(ComponentReads | 'too-large')[]> {
  const flat = (key: 'folders' | 'texts') =>
    plugins.flatMap(({ location, ...paths }, plugin) => paths[key].map((path) => ({ plugin, location, path })));
  const [folderTargets, textTargets] = [flat('folders'), flat('texts')];
  const [folders, texts] = await Promise.all([read(client, folderTargets, false), read(client, textTargets, true)]);
  const reads = plugins.map(() => ({ files: new Map<string, string[]>(), texts: new Map<string, string>() }));
  const tooLarge = new Set<number>();
  for (const [index, { plugin, path }] of folderTargets.entries()) {
    const files = folderFiles(folders[index], path);
    if (files !== undefined) reads[plugin]?.files.set(path, files);
  }
  for (const [index, { plugin, path }] of textTargets.entries()) {
    const file = fileRead(textAnswer.parse(texts[index])?.path);
    if (file === 'too-large') tooLarge.add(plugin);
    else if (file.text !== undefined) reads[plugin]?.texts.set(path, file.text);
  }
  return reads.map((own, plugin) => (tooLarge.has(plugin) ? 'too-large' : own));
}

/** The files a folder location holds, its own name for a location that is a file, or undefined for a missing path. */
function folderFiles(answer: unknown, path: string): string[] | undefined {
  const found = folderAnswer.parse(answer)?.path;
  if (found === null || found === undefined) return undefined;
  return found.entries === undefined ? [path.split('/').at(-1) ?? path] : blobPaths(found.entries, '');
}
