import { pluginRecord, versionLabel } from '@directory/contracts';
import { z } from 'zod';
import { type HookEvents, hookEvents, hookFacts, inlineHookEvents } from './hook-analyzer.ts';
import { jsonText } from './json-text.ts';
import { unpinnedPackage } from './package-pin.ts';
import type { Entry, Inspection } from './repository-tree.ts';

const userConfig = z.record(z.string(), z.object({ sensitive: z.boolean().optional() })).optional();
// Upstream files carry more keys than these; only the keys a fact needs are read, the rest is stripped.
const manifest = z.object({
  name: z.unknown().optional(),
  version: z.unknown().optional(),
  description: z.unknown().optional(),
  author: z.unknown().optional(),
  repository: z.unknown().optional(),
  homepage: z.unknown().optional(),
  license: z.unknown().optional(),
  hooks: z.unknown().optional(),
  mcpServers: z.unknown().optional(),
  lspServers: z.unknown().optional(),
  userConfig,
  channels: z.array(z.object({ userConfig })).optional(),
});
const strings = z.record(z.string(), z.string()).optional();
const server = z.object({
  type: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  env: strings,
  headers: strings,
});
type Server = z.infer<typeof server>;
const serverMap = z.record(z.string(), server);
const wrappedServers = z.object({ mcpServers: serverMap });
const lspConfig = z.record(z.string(), z.unknown());

// A Set, so a type such as `constructor` reads no inherited property.
const transports: ReadonlySet<string> = new Set(['stdio', 'http', 'sse'] as const);
const isTransport = (type: string): type is 'stdio' | 'http' | 'sse' => transports.has(type);
// A `${NAME}` without a default, or with an empty one, is set by the user; the path variables and HOME always hold a value.
const userVariable = /\$\{(?!CLAUDE_PLUGIN_|CLAUDE_PROJECT_DIR\b|HOME\b)[A-Za-z_]\w*(?::-)?\}/;
const configReference = /\$\{user_config\.\w+\}/g;

/** The `${user_config.KEY}` references whose option, of the plugin or of a channel, stores its value as a secret. */
function secretReferences({ userConfig: options = {}, channels = [] }: z.infer<typeof manifest>): Set<string> {
  return new Set(
    [options, ...channels.map((channel) => channel.userConfig ?? {})].flatMap((config) =>
      Object.entries(config)
        .filter(([, option]) => option.sensitive === true)
        .map(([key]) => `\${user_config.${key}}`),
    ),
  );
}

/** A manifest value that is an object holds the configuration inline; a path or a list of paths is not followed. */
function inline(value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

const components = pluginRecord.shape.components.pick({ hooksByEvent: true });

/** The handlers per event; more events than the record holds throw a ZodError. */
function hooksByEvent(configs: readonly HookEvents[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const config of configs)
    for (const [event, groups] of Object.entries(config))
      counts[event] = (counts[event] ?? 0) + groups.reduce((sum, group) => sum + group.hooks.length, 0);
  return components.parse({ hooksByEvent: counts }).hooksByEvent;
}

function mcpServers(configs: readonly unknown[]): Server[] {
  return configs.flatMap((config) => {
    if (config === undefined) return [];
    // With the `mcpServers` key the map is read from it alone, so one malformed server refuses the record.
    const wrapped = typeof config === 'object' && config !== null && 'mcpServers' in config;
    return Object.values(wrapped ? wrappedServers.parse(config).mcpServers : serverMap.parse(config));
  });
}

function mcpServersByTransport(list: readonly Server[]): Partial<Record<'stdio' | 'http' | 'sse', number>> {
  const counts: Partial<Record<'stdio' | 'http' | 'sse', number>> = {};
  for (const { type = 'stdio' } of list) if (isTransport(type)) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
}

function lspServers(configs: readonly unknown[]): number {
  return configs.reduce<number>(
    (sum, config) => sum + (config === undefined ? 0 : Object.keys(lspConfig.parse(config)).length),
    0,
  );
}

function countEntries(
  entries: readonly Entry[] | undefined,
  markdownOnly: boolean,
  type: Entry['type'] = 'blob',
): number {
  return entries?.filter((entry) => entry.type === type && (!markdownOnly || entry.name.endsWith('.md'))).length ?? 0;
}

function parseFile(text: string | undefined): unknown {
  return text === undefined ? undefined : jsonText.parse(text);
}

const text = z.string().min(1);
const filled = (value: unknown): boolean => text.safeParse(value).success;
const namedAuthor = z.object({ name: text });

/** Of version, description, author, repository or homepage, and license: each given with a value. */
function manifestFields(plugin: z.infer<typeof manifest>, versioned: boolean): number {
  return [
    versioned,
    filled(plugin.description),
    filled(plugin.author) || namedAuthor.safeParse(plugin.author).success,
    filled(plugin.repository) || filled(plugin.homepage),
    filled(plugin.license),
  ].filter(Boolean).length;
}

/** The facts of a plugin directory in the default layout; component paths a manifest adds are not followed. */
export function analyzePlugin({ directories, files }: Inspection) {
  const plugin = manifest.parse(parseFile(files.manifest) ?? {});
  const version = versionLabel.safeParse(plugin.version);
  const inlineHooks = inline(plugin.hooks);
  // Hooks in plugin.json run like those in hooks/hooks.json; a malformed one throws, so the plugin gets no record.
  const hookConfigs = [
    files.hooks === undefined ? undefined : hookEvents(files.hooks),
    inlineHooks === undefined ? undefined : inlineHookEvents(inlineHooks),
  ].filter((config) => config !== undefined);
  const serverList = mcpServers([parseFile(files.mcp), inline(plugin.mcpServers)]);
  const stdio = serverList.filter(({ type = 'stdio' }) => type === 'stdio');
  const secrets = secretReferences(plugin);
  return {
    ...(version.success ? { version: version.data } : {}),
    components: {
      skills: countEntries(directories.skills, false, 'tree'),
      agents: countEntries(directories.agents, true),
      commands: countEntries(directories.commands, true),
      hooksByEvent: hooksByEvent(hookConfigs),
      mcpServersByTransport: mcpServersByTransport(serverList),
      lspServers: lspServers([parseFile(files.lsp), inline(plugin.lspServers)]),
      outputStyles: countEntries(directories.outputStyles, true),
      // The monitor format is not read yet.
      monitors: 0,
      binFiles: countEntries(directories.bin, false),
    },
    hasEvals: directories.root?.some((entry) => entry.name === 'evals') ?? false,
    ...(typeof plugin.name === 'string' ? { manifestName: plugin.name } : {}),
    manifestFields: manifestFields(plugin, version.success),
    manifestLicense: text.safeParse(plugin.license).data,
    rootClaudeMd: directories.root?.some((entry) => entry.name === 'CLAUDE.md') ?? false,
    hooks: hookConfigs.map(hookFacts),
    mcpUnpinnedPackage: stdio.some(({ command, args = [] }) => command !== undefined && unpinnedPackage(command, args)),
    mcpSecretsRequired: serverList.some(({ args = [], url = '', env = {}, headers = {} }) =>
      [...args, url, ...Object.values(env), ...Object.values(headers)].some(
        (value) => userVariable.test(value) || (value.match(configReference) ?? []).some((name) => secrets.has(name)),
      ),
    ),
  };
}
