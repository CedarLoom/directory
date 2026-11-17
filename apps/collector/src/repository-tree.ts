import { z } from 'zod';
import { queryEach } from './github-graphql.ts';
import { type GitHubLocation, joinPath } from './github-location.ts';
import type { HttpClient } from './http-client.ts';

// Third-party file text stays in memory: it is parsed for facts and never written.

/** The layout folders an inspection lists, by key. */
export const directoryPaths = {
  root: '',
  skills: 'skills',
  claudeSkills: '.claude/skills',
  agents: 'agents',
  claudeAgents: '.claude/agents',
  commands: 'commands',
  outputStyles: 'output-styles',
  claudeOutputStyles: '.claude/output-styles',
  bin: 'bin',
} as const;

const files = {
  manifest: '.claude-plugin/plugin.json',
  marketplace: '.claude-plugin/marketplace.json',
  hooks: 'hooks/hooks.json',
  mcp: '.mcp.json',
  lsp: '.lsp.json',
} as const;

export type DirectoryKey = keyof typeof directoryPaths;
type FileKey = keyof typeof files;

const entry = z.object({ name: z.string(), type: z.enum(['blob', 'tree', 'commit']) });
export type Entry = z.infer<typeof entry>;

// A path that is a file where a directory is read, or the reverse, reads as an empty object.
const directory = z.object({ entries: z.array(entry).optional() }).nullable();
/** A Blob read with `text isTruncated`; GitHub cuts a large file's text and sets isTruncated. */
export const blob = z
  .object({ text: z.string().nullable().optional(), isTruncated: z.boolean().optional() })
  .nullable();

// The largest file parsed, in UTF-8 bytes; GitHub returns about 512 KB of a Blob's text before it cuts it.
const maxFileBytes = 256 * 1024;

/** A file read: its text, absent for a missing or binary file, or too large when GitHub cut it or it passes the cap. */
export type FileRead = { text?: string } | 'too-large';

export function fileRead(file: z.infer<typeof blob> | undefined): FileRead {
  const text = file?.text ?? undefined;
  if (file?.isTruncated === true || (text !== undefined && Buffer.byteLength(text) > maxFileBytes)) return 'too-large';
  return text === undefined ? {} : { text };
}

/** What one location holds of the plugin, skill, agent and marketplace layout. */
export interface Inspection {
  directories: Partial<Record<DirectoryKey, Entry[]>>;
  /** The text of each layout file; a binary file has none. */
  files: Partial<Record<FileKey, string>>;
}

/** A Git object expression `<ref>:<path>`, the form GraphQL's `object(expression:)` reads. */
export function expression({ ref, path }: GitHubLocation, relative: string): string {
  return `${ref}:${joinPath(path, relative)}`;
}

function keysOf<T extends object>(value: T): Extract<keyof T, string>[] {
  return Object.keys(value).filter((key): key is Extract<keyof T, string> => key in value);
}

/** The text of each layout file, or too large when one of them is. */
function layoutFiles(answer: Readonly<Record<string, unknown>>): Inspection['files'] | 'too-large' {
  const found: Inspection['files'] = {};
  for (const key of keysOf(files)) {
    const read = fileRead(blob.parse(answer[key]));
    if (read === 'too-large') return read;
    if (read.text !== undefined) found[key] = read.text;
  }
  return found;
}

/**
 * The layout a location holds; a missing location gives undefined and a layout file that is too large gives
 * 'too-large', so no record is built from part of it.
 */
function toInspection(raw: unknown): Inspection | 'too-large' | undefined {
  if (raw === null) return undefined;
  const answer = z.record(z.string(), z.unknown()).parse(raw);
  const found = layoutFiles(answer);
  if (directory.parse(answer['root']) === null) return undefined;
  if (found === 'too-large') return found;
  const inspection: Inspection = { directories: {}, files: found };
  for (const key of keysOf(directoryPaths)) {
    const entries = directory.parse(answer[key])?.entries;
    if (entries !== undefined) inspection.directories[key] = entries;
  }
  return inspection;
}

/** Reads the layout of each location, ten to a query. */
export async function inspectLocations(
  client: HttpClient,
  locations: readonly GitHubLocation[],
): Promise<(Inspection | 'too-large' | undefined)[]> {
  const paths: Record<string, string> = { ...directoryPaths, ...files };
  const answers = await queryEach(client, locations, {
    name: 'Inspect',
    variables: {
      owner: 'String!',
      name: 'String!',
      ...Object.fromEntries(Object.keys(paths).map((key) => [key, 'String!'])),
    },
    field: (variable) => {
      const objects = [
        ...Object.keys(directoryPaths).map((key) => `${key}: object(expression: ${variable(key)}) { ...Dir }`),
        ...Object.keys(files).map((key) => `${key}: object(expression: ${variable(key)}) { ...File }`),
      ];
      return `repository(owner: ${variable('owner')}, name: ${variable('name')}) { ${objects.join(' ')} }`;
    },
    values: (location) => ({
      owner: location.owner,
      name: location.repo,
      ...Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, expression(location, path)])),
    }),
    fragments: 'fragment Dir on Tree { entries { name type } } fragment File on Blob { text isTruncated }',
    batchSize: 10,
  });
  return answers.map(toInspection);
}
