import { z } from 'zod';
import { queryEach } from './github-graphql.ts';
import { type GitHubLocation, joinPath } from './github-location.ts';
import type { HttpClient } from './http-client.ts';

// Third-party file text stays in memory: it is parsed for facts and never written.

const directories = {
  root: '',
  skills: 'skills',
  claudeSkills: '.claude/skills',
  agents: 'agents',
  claudeAgents: '.claude/agents',
  commands: 'commands',
  outputStyles: 'output-styles',
  bin: 'bin',
} as const;

const files = {
  manifest: '.claude-plugin/plugin.json',
  marketplace: '.claude-plugin/marketplace.json',
  hooks: 'hooks/hooks.json',
  mcp: '.mcp.json',
  lsp: '.lsp.json',
} as const;

export type DirectoryKey = keyof typeof directories;
type FileKey = keyof typeof files;

const entry = z.object({ name: z.string(), type: z.enum(['blob', 'tree', 'commit']) });
export type Entry = z.infer<typeof entry>;

// A path that is a file where a directory is read, or the reverse, reads as an empty object.
const directory = z.object({ entries: z.array(entry).optional() }).nullable();
const blob = z.object({ text: z.string().nullable().optional() }).nullable();

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

function toInspection(raw: unknown): Inspection | undefined {
  if (raw === null) return undefined;
  const answer = z.record(z.string(), z.unknown()).parse(raw);
  const inspection: Inspection = { directories: {}, files: {} };
  for (const key of keysOf(directories)) {
    const entries = directory.parse(answer[key])?.entries;
    if (entries !== undefined) inspection.directories[key] = entries;
  }
  for (const key of keysOf(files)) {
    const text = blob.parse(answer[key])?.text;
    if (text != null) inspection.files[key] = text;
  }
  return inspection;
}

/** Reads the layout of each location, ten to a query; a location in a missing repository gives undefined. */
export async function inspectLocations(
  client: HttpClient,
  locations: readonly GitHubLocation[],
): Promise<(Inspection | undefined)[]> {
  const paths: Record<string, string> = { ...directories, ...files };
  const answers = await queryEach(client, locations, {
    name: 'Inspect',
    variables: {
      owner: 'String!',
      name: 'String!',
      ...Object.fromEntries(Object.keys(paths).map((key) => [key, 'String!'])),
    },
    field: (variable) => {
      const objects = [
        ...Object.keys(directories).map((key) => `${key}: object(expression: ${variable(key)}) { ...Dir }`),
        ...Object.keys(files).map((key) => `${key}: object(expression: ${variable(key)}) { ...File }`),
      ];
      return `repository(owner: ${variable('owner')}, name: ${variable('name')}) { ${objects.join(' ')} }`;
    },
    values: (location) => ({
      owner: location.owner,
      name: location.repo,
      ...Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, expression(location, path)])),
    }),
    fragments: 'fragment Dir on Tree { entries { name type } } fragment File on Blob { text }',
    batchSize: 10,
  });
  return answers.map(toInspection);
}
