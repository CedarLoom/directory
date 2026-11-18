import { filePaths } from './repository-tree.ts';

/** The default configuration files of a plugin's hooks, MCP servers, LSP servers and monitors. */
const configFiles = {
  hooks: filePaths.hooks,
  mcpServers: filePaths.mcp,
  lspServers: filePaths.lsp,
  monitors: filePaths.monitors,
} as const;

const folders = {
  skills: 'skills',
  commands: 'commands',
  agents: 'agents',
  outputStyles: 'output-styles',
  themes: 'themes',
  workflows: 'workflows',
} as const;

type FolderKind = keyof typeof folders;
type ConfigKind = keyof typeof configFiles;

/** The manifest values that name where components live. */
export interface LocationFields {
  commands?: unknown;
  agents?: unknown;
  skills?: unknown;
  outputStyles?: unknown;
  workflows?: unknown;
  themes?: unknown;
  hooks?: unknown;
  mcpServers?: unknown;
  lspServers?: unknown;
  monitors?: unknown;
}

/** The folders and configuration files of each kind of component, by path relative to the plugin folder. */
export interface ComponentLocations {
  folders: Record<FolderKind, string[]>;
  configs: Record<ConfigKind, string[]>;
}

/**
 * A manifest path relative to the plugin folder, without `.` segments, or undefined for one that is absolute or leaves
 * the folder, as an installed plugin holds only its own folder.
 */
export function pluginPath(value: string): string | undefined {
  if (value.startsWith('/')) return undefined;
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) return undefined;
    } else if (part !== '' && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

/** The paths inside the plugin folder that the values name, alone or in a list; an inline object names none. */
function namedPaths(values: readonly unknown[]): string[] {
  const paths = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .flatMap((value) => (typeof value === 'string' ? (pluginPath(value) ?? []) : []));
  return [...new Set(paths)];
}

/** The paths the manifest gives for a kind, which replace its default location, or else the default location. */
function replacing(values: readonly unknown[], fallback: string): string[] {
  const given = values.filter((value) => value !== undefined);
  return given.length > 0 ? namedPaths(given) : [fallback];
}

export const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Where each kind of component lives. Paths for skills, commands, agents, output styles, themes, workflows and
 * monitors replace the default location; hooks, MCP and LSP files add to the default file. A `commands` object map
 * holds its commands itself.
 */
export function componentLocations(
  fields: LocationFields,
  experimental: { monitors?: unknown; themes?: unknown },
): ComponentLocations {
  return {
    folders: {
      skills: replacing([fields.skills], folders.skills),
      commands: isObject(fields.commands) ? [] : replacing([fields.commands], folders.commands),
      agents: replacing([fields.agents], folders.agents),
      outputStyles: replacing([fields.outputStyles], folders.outputStyles),
      themes: replacing([fields.themes, experimental.themes], folders.themes),
      workflows: replacing([fields.workflows], folders.workflows),
    },
    configs: {
      hooks: namedPaths([configFiles.hooks, fields.hooks]),
      mcpServers: namedPaths([configFiles.mcpServers, fields.mcpServers]),
      lspServers: namedPaths([configFiles.lspServers, fields.lspServers]),
      monitors: replacing([fields.monitors, experimental.monitors], configFiles.monitors),
    },
  };
}
