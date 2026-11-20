import { z } from 'zod';
import { type ItemAnswer, queryEachApart } from './github-graphql.ts';
import type { GitHubLocation } from './github-location.ts';
import type { HttpClient, RequestError } from './http-client.ts';
import { readItemFiles } from './item-files.ts';
import { expression } from './repository-tree.ts';

// Third-party file text stays in memory: it is parsed for facts and never written.

/** What a plugin's component locations hold, by path relative to the plugin folder. */
export interface ComponentReads {
  /** The files of each folder location, by path relative to it, three levels deep; a location that is a file holds the empty path. */
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

const folderFragment = (depth: number): string =>
  depth === 1
    ? 'entries { name type }'
    : `entries { name type object { ... on Tree { ${folderFragment(depth - 1)} } } }`;

function blobPaths(entries: readonly TreeEntry[], prefix: string): string[] {
  return entries.flatMap(({ name, type, object }) => {
    if (type === 'blob') return [`${prefix}${name}`];
    return type === 'tree' ? blobPaths(object?.entries ?? [], `${prefix}${name}/`) : [];
  });
}

type Target = { location: GitHubLocation; path: string };

function readFolders(client: HttpClient, targets: readonly Target[]): Promise<ItemAnswer[]> {
  return queryEachApart(client, targets, {
    name: 'ComponentFolders',
    variables: { owner: 'String!', name: 'String!', path: 'String!' },
    // Three levels hold a command or agent two subfolders down and a skill folder's SKILL.md.
    field: (variable) =>
      `repository(owner: ${variable('owner')}, name: ${variable('name')}) { path: object(expression: ${variable('path')}) { ... on Tree { ${folderFragment(3)} } } }`,
    values: ({ location, path }) => ({ owner: location.owner, name: location.repo, path: expression(location, path) }),
    fragments: '',
    batchSize: 25,
  });
}

type Reads = { files: Map<string, string[]>; texts: Map<string, string> };

/** Adds each folder's files to its plugin's reads; returns the error of each plugin with a folder that fails alone. */
function addFolders(
  reads: readonly Reads[],
  targets: readonly { plugin: number; path: string }[],
  answers: readonly ItemAnswer[],
): Map<number, RequestError> {
  const failed = new Map<number, RequestError>();
  for (const [index, { plugin, path }] of targets.entries()) {
    const answer = answers[index];
    if (answer !== undefined && 'error' in answer) failed.set(plugin, answer.error);
    const files = answer !== undefined && 'field' in answer ? folderFiles(answer.field) : undefined;
    if (files !== undefined) reads[plugin]?.files.set(path, files);
  }
  return failed;
}

/**
 * Reads the component folders and configuration files of each plugin, 25 to a query; a plugin with a file that GitHub
 * cuts or that passes the size cap gives 'too-large', and one with a folder whose own read fails gives that error, so
 * no record is built from part of it.
 */
export async function readComponents(
  client: HttpClient,
  plugins: readonly ComponentTargets[],
): Promise<(ComponentReads | 'too-large' | RequestError)[]> {
  const flat = (key: 'folders' | 'texts') =>
    plugins.flatMap(({ location, ...paths }, plugin) => paths[key].map((path) => ({ plugin, location, path })));
  const [folderTargets, textTargets] = [flat('folders'), flat('texts')];
  const [folders, texts] = await Promise.all([
    readFolders(client, folderTargets),
    readItemFiles(
      client,
      textTargets.map(({ location, path }) => ({ location, file: path })),
      false,
    ),
  ]);
  const reads = plugins.map((): Reads => ({ files: new Map(), texts: new Map() }));
  const failed = addFolders(reads, folderTargets, folders);
  const tooLarge = new Set<number>();
  for (const [index, { plugin, path }] of textTargets.entries()) {
    const file = texts[index]?.file;
    if (file === 'too-large') tooLarge.add(plugin);
    else if (file?.text !== undefined) reads[plugin]?.texts.set(path, file.text);
  }
  return reads.map((own, plugin) => failed.get(plugin) ?? (tooLarge.has(plugin) ? 'too-large' : own));
}

/** The files a folder location holds, the empty path for a location that is a file, or undefined for a missing path. */
function folderFiles(answer: unknown): string[] | undefined {
  const found = folderAnswer.parse(answer)?.path;
  if (found === null || found === undefined) return undefined;
  return found.entries === undefined ? [''] : blobPaths(found.entries, '');
}
