import { pluginRecord, versionLabel } from '@directory/contracts';
import { z } from 'zod';
import {
  type HookEvents,
  handledEvents,
  hookEvents,
  hookFacts,
  hookModules,
  inlineHookEvents,
} from './hook-analyzer.ts';
import { componentLocations, isObject, pluginPath } from './component-locations.ts';
import type { ComponentReads } from './component-reads.ts';
import { joinPath } from './github-location.ts';
import { jsonText } from './json-text.ts';
import { isLicenseValue } from './license-class.ts';
import { unpinnedPackage } from './package-pin.ts';
import { type Entry, type Inspection, filePaths } from './repository-tree.ts';

const userConfig = z
  .record(z.string(), z.object({ sensitive: z.boolean().optional(), default: z.unknown().optional() }))
  .optional();
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
  // `monitors` is read at the top level and under `experimental`, where newer manifests declare it.
  monitors: z.unknown().optional(),
  experimental: z.unknown().optional(),
  commands: z.unknown().optional(),
  agents: z.unknown().optional(),
  skills: z.unknown().optional(),
  outputStyles: z.unknown().optional(),
  workflows: z.unknown().optional(),
  // `themes` is read at the top level and under `experimental`, like `monitors`.
  themes: z.unknown().optional(),
  userConfig,
  channels: z.array(z.object({ userConfig })).optional(),
});
export type PluginManifest = z.infer<typeof manifest>;
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
const monitorList = z.array(z.unknown());
// `experimental` holds other settings too; a value that is no object holds no monitors or themes.
const experimental = z.object({ monitors: z.unknown().optional(), themes: z.unknown().optional() });

// A Set, so a type such as `constructor` reads no inherited property.
const transports: ReadonlySet<string> = new Set(['stdio', 'http', 'sse'] as const);
const isTransport = (type: string): type is 'stdio' | 'http' | 'sse' => transports.has(type);
// A `${NAME}` without a default, or with an empty one, is set by the user; the path variables and HOME always hold a value.
const userVariable = /\$\{(?!CLAUDE_PLUGIN_|CLAUDE_PROJECT_DIR\b|HOME\b)[A-Za-z_]\w*(?::-)?\}/;
const configReference = /\$\{user_config\.\w+\}/g;
// A default of null or an empty text leaves the value to the user like a missing one.
const noDefault: ReadonlySet<unknown> = new Set([undefined, null, '']);

/**
 * The `${user_config.KEY}` references whose option, of the plugin or of a channel, stores its value as a secret and
 * gives no default, so the user sets it.
 */
function secretReferences({ userConfig: options = {}, channels = [] }: z.infer<typeof manifest>): Set<string> {
  return new Set(
    [options, ...channels.map((channel) => channel.userConfig ?? {})].flatMap((config) =>
      Object.entries(config)
        .filter(([, option]) => option.sensitive === true && noDefault.has(option.default))
        .map(([key]) => `\${user_config.${key}}`),
    ),
  );
}

/** The configurations a manifest value holds inline: the object, or the objects of a list. */
function inline(value: unknown): object[] {
  return (Array.isArray(value) ? value : [value]).filter(isObject);
}

const components = pluginRecord.shape.components.pick({ hooksByEvent: true });

/** The handlers per event the hook record names; more events than the record holds throw a ZodError. */
function hooksByEvent(configs: readonly HookEvents[]): Record<string, number> {
  // A Map, so an event named like an Object property, such as `constructor`, counts from zero.
  const counts = new Map<string, number>();
  for (const config of configs)
    for (const [event, groups] of handledEvents(config))
      counts.set(event, (counts.get(event) ?? 0) + groups.reduce((sum, group) => sum + group.hooks.length, 0));
  return components.parse({ hooksByEvent: Object.fromEntries(counts) }).hooksByEvent;
}

function mcpServers(configs: readonly unknown[]): Server[] {
  return configs.flatMap((config) => {
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
  return configs.reduce<number>((sum, config) => sum + Object.keys(lspConfig.parse(config)).length, 0);
}

/** The monitor objects of the manifest's lists and of the monitor files at its locations. */
function monitors(manifestValues: readonly unknown[], files: readonly unknown[]): number {
  return [...manifestValues, ...files.map((file) => monitorList.parse(file))]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter(isObject).length;
}

const commandEntry = z.object({ source: z.string().optional(), content: z.string().optional() });

/** A command map entry gives exactly one of its text or a source file inside the plugin folder. */
function validCommand(entry: unknown): boolean {
  const { source, content } = commandEntry.safeParse(entry).data ?? {};
  return source === undefined ? content !== undefined : content === undefined && pluginPath(source) !== undefined;
}

const unique = (paths: readonly string[]): string[] => [...new Set(paths)];

/**
 * The files with the extension at the locations, at every depth read or, with `direct`, only those directly in a folder,
 * by path relative to the plugin folder; each once, as locations can nest.
 */
function filesAt(reads: ComponentReads, locations: readonly string[], extension: string, direct = false): string[] {
  const files = locations.flatMap((location) =>
    (reads.files.get(location) ?? []).map((file) => ({ file, path: joinPath(location, file) })),
  );
  return unique(
    files
      .filter(({ file, path }) => path.endsWith(extension) && !(direct && file.includes('/')))
      .map(({ path }) => path),
  );
}

/** The skill folders at the locations, a location that holds SKILL.md or else each subfolder that does; each once. */
function skillFolders(reads: ComponentReads, locations: readonly string[]): string[] {
  return unique(
    locations.flatMap((location) => {
      const files = reads.files.get(location) ?? [];
      if (files.includes('SKILL.md')) return [location];
      return files
        .flatMap((file) => /^([^/]+)\/SKILL\.md$/.exec(file)?.[1] ?? [])
        .map((name) => joinPath(location, name));
    }),
  );
}

/** The skill folders, agent files and output style files at a plugin's component locations, relative to its folder. */
export interface ComponentItems {
  skills: string[];
  agents: string[];
  outputStyles: string[];
}

/** The skills, agents and output styles at the component locations the manifest names, read in `reads`. */
export function componentItems(plugin: PluginManifest, reads: ComponentReads): ComponentItems {
  const { folders } = manifestLocations(plugin);
  return {
    skills: skillFolders(reads, folders.skills),
    agents: filesAt(reads, folders.agents, '.md', true),
    outputStyles: filesAt(reads, folders.outputStyles, '.md', true),
  };
}

/** A plugin with SKILL.md at its root, no `skills/` folder and no `skills` key loads as one skill. */
const rootSkill = (plugin: PluginManifest, { root, skills }: Inspection['directories']): boolean =>
  plugin.skills === undefined &&
  skills === undefined &&
  (root?.some((entry) => entry.type === 'blob' && entry.name === 'SKILL.md') ?? false);

/** The valid commands of an object map, which replaces the `commands/` folder, or the command files. */
function commandCount(plugin: PluginManifest, reads: ComponentReads, locations: readonly string[]): number {
  return isObject(plugin.commands)
    ? Object.values(plugin.commands).filter(validCommand).length
    : filesAt(reads, locations, '.md').length;
}

function countEntries(entries: readonly Entry[] | undefined): number {
  return entries?.filter((entry) => entry.type === 'blob').length ?? 0;
}

const text = z.string().min(1);
const filled = (value: unknown): boolean => text.safeParse(value).success;
const namedAuthor = z.object({ name: text });

/**
 * Of version, description, author, repository or homepage, and license: each given with a value, the license read like
 * a skill's license field.
 */
function manifestFields(plugin: z.infer<typeof manifest>, versioned: boolean): number {
  return [
    versioned,
    filled(plugin.description),
    filled(plugin.author) || namedAuthor.safeParse(plugin.author).success,
    filled(plugin.repository) || filled(plugin.homepage),
    typeof plugin.license === 'string' && isLicenseValue(plugin.license),
  ].filter(Boolean).length;
}

export const licenseField = (value: unknown): string | undefined => text.safeParse(value).data;
const manifestObject = jsonText.pipe(manifest.pick({ license: true }));

/** The license field of plugin.json, else that of the plugin's marketplace entry. */
const pluginLicense = (field: unknown, entryLicense: string | undefined): string | undefined =>
  licenseField(field) ?? entryLicense;

/**
 * The manifest license of a plugin for the items it holds, or `invalid` for a manifest that is no JSON object, which
 * refuses them as it refuses the plugin's own record.
 */
export function manifestLicense(
  file: string | undefined,
  entryLicense: string | undefined,
): { license: string | undefined } | 'invalid' {
  const parsed = file === undefined ? {} : manifestObject.safeParse(file).data;
  return parsed === undefined ? 'invalid' : { license: pluginLicense(parsed.license, entryLicense) };
}

/** The manifest's keys; only a missing file is an empty manifest, so JSON null, like any non-object, fails. */
export const readManifest = (file: string | undefined) =>
  (file === undefined ? manifest : jsonText.pipe(manifest)).safeParse(file ?? {});

/** The manifest's experimental values and the component locations it names. */
function manifestLocations(plugin: z.infer<typeof manifest>) {
  const experimentalValues = experimental.safeParse(plugin.experimental).data ?? {};
  return { experimentalValues, ...componentLocations(plugin, experimentalValues) };
}

const layoutPaths: ReadonlySet<string> = new Set(Object.values(filePaths));

/** The component folders and the configuration files beyond the layout files that the manifest names and the plugin's root holds. */
export function componentTargets(
  { directories }: Inspection,
  plugin: PluginManifest,
): { folders: string[]; texts: string[] } {
  const { folders, configs } = manifestLocations(plugin);
  // A path below a root entry the listing lacks is missing, so it costs no read.
  const rootNames = new Set(directories.root?.map((entry) => entry.name));
  const held = (path: string) => path === '' || rootNames.has(path.split('/')[0] ?? '');
  return {
    folders: [...new Set(Object.values(folders).flat())].filter(held),
    texts: [...new Set(Object.values(configs).flat())].filter((path) => !layoutPaths.has(path) && held(path)),
  };
}

/** The text of each configuration file at the paths, of a layout file from the layout read. */
function configTexts(files: Inspection['files'], reads: ComponentReads, paths: readonly string[]): string[] {
  const layout = new Map<string, string | undefined>([
    [filePaths.hooks, files.hooks],
    [filePaths.mcp, files.mcp],
    [filePaths.lsp, files.lsp],
    [filePaths.monitors, files.monitors],
  ]);
  return paths.flatMap((path) => (layout.has(path) ? layout.get(path) : reads.texts.get(path)) ?? []);
}

/**
 * The facts of a plugin directory, read at the component locations of its manifest, with the license of the
 * marketplace entry when plugin.json states none.
 */
export function analyzePlugin(
  { directories, files }: Inspection,
  plugin: PluginManifest,
  reads: ComponentReads,
  entryLicense?: string,
) {
  const version = versionLabel.safeParse(plugin.version);
  const { experimentalValues, folders, configs } = manifestLocations(plugin);
  const texts = (paths: readonly string[]) => configTexts(files, reads, paths);
  const hookFiles = texts(configs.hooks);
  const inlineHooks = inline(plugin.hooks);
  // Hooks in plugin.json run like those in hook files; a malformed one throws, so the plugin gets no record.
  const hookConfigs = [...hookFiles.map(hookEvents), ...inlineHooks.map(inlineHookEvents)].filter(
    (config) => config !== undefined,
  );
  const parsed = (paths: readonly string[]) => texts(paths).map((file) => jsonText.parse(file));
  const serverList = mcpServers([...parsed(configs.mcpServers), ...inline(plugin.mcpServers)]);
  const stdio = serverList.filter(({ type = 'stdio' }) => type === 'stdio');
  const secrets = secretReferences(plugin);
  const items = componentItems(plugin, reads);
  return {
    ...(version.success ? { version: version.data } : {}),
    components: {
      skills: rootSkill(plugin, directories) ? 1 : items.skills.length,
      agents: items.agents.length,
      commands: commandCount(plugin, reads, folders.commands),
      hooksByEvent: hooksByEvent(hookConfigs),
      mcpServersByTransport: mcpServersByTransport(serverList),
      lspServers: lspServers([...parsed(configs.lspServers), ...inline(plugin.lspServers)]),
      outputStyles: items.outputStyles.length,
      monitors: monitors([plugin.monitors, experimentalValues.monitors], parsed(configs.monitors)),
      binFiles: countEntries(directories.bin),
    },
    modules: hookModules([...parsed(configs.hooks), ...inlineHooks]),
    themesOrWorkflows:
      filesAt(reads, folders.themes, '.json', true).length + filesAt(reads, folders.workflows, '.js', true).length > 0,
    hasEvals: directories.root?.some((entry) => entry.name === 'evals') ?? false,
    ...(typeof plugin.name === 'string' ? { manifestName: plugin.name } : {}),
    manifestFields: manifestFields(plugin, version.success),
    manifestLicense: pluginLicense(plugin.license, entryLicense),
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
