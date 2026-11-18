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
import { componentLocations, configFiles, isObject, pluginPath } from './component-locations.ts';
import type { ComponentReads } from './component-reads.ts';
import { jsonText } from './json-text.ts';
import { isLicenseValue } from './license-class.ts';
import { unpinnedPackage } from './package-pin.ts';
import type { Entry, Inspection } from './repository-tree.ts';

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

/** The files the locations hold, by path relative to each location. */
const locationFiles = (reads: ComponentReads, paths: readonly string[]): string[] =>
  paths.flatMap((path) => reads.files.get(path) ?? []);

const ownFiles = (files: readonly string[], extension: string): number =>
  files.filter((file) => !file.includes('/') && file.endsWith(extension)).length;

const markdownFiles = (files: readonly string[]): number => files.filter((file) => file.endsWith('.md')).length;

/**
 * The skill folders, those holding SKILL.md, or a location that is one itself; a plugin with SKILL.md at its root, no
 * `skills/` folder and no `skills` key loads as one skill.
 */
function skillCount(
  plugin: z.infer<typeof manifest>,
  { root, skills }: Inspection['directories'],
  reads: ComponentReads,
  paths: readonly string[],
): number {
  const rootSkill =
    plugin.skills === undefined &&
    skills === undefined &&
    (root?.some((entry) => entry.type === 'blob' && entry.name === 'SKILL.md') ?? false);
  if (rootSkill) return 1;
  return paths
    .map((path) => reads.files.get(path) ?? [])
    .reduce(
      (sum, files) =>
        sum + (files.includes('SKILL.md') ? 1 : files.filter((file) => /^[^/]+\/SKILL\.md$/.test(file)).length),
      0,
    );
}

/** The valid commands of an object map, which replaces the `commands/` folder, or the command files. */
function commandCount(plugin: z.infer<typeof manifest>, files: readonly string[]): number {
  return isObject(plugin.commands) ? Object.values(plugin.commands).filter(validCommand).length : markdownFiles(files);
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

/** The manifest's keys; only a missing file is an empty manifest, so JSON null, like any non-object, throws. */
function readManifest(file: string | undefined): z.infer<typeof manifest> {
  return manifest.parse(file === undefined ? {} : jsonText.parse(file));
}

/**
 * The component folders and the configuration files beyond the layout files that the manifest names; a manifest that is
 * no JSON object names none, as it refuses the plugin's record.
 */
export function componentTargets(file: string | undefined): { folders: string[]; texts: string[] } {
  const parsed = file === undefined ? manifest.safeParse({}) : jsonText.pipe(manifest).safeParse(file);
  if (!parsed.success) return { folders: [], texts: [] };
  const { folders, configs } = componentLocations(
    parsed.data,
    experimental.safeParse(parsed.data.experimental).data ?? {},
  );
  const layout = new Set<string>(Object.values(configFiles));
  return {
    folders: [...new Set(Object.values(folders).flat())],
    texts: [...new Set(Object.values(configs).flat())].filter((path) => !layout.has(path)),
  };
}

/** The text of each configuration file at the paths, of a layout file from the layout read. */
function configTexts(files: Inspection['files'], reads: ComponentReads, paths: readonly string[]): string[] {
  const layout = new Map<string, string | undefined>([
    [configFiles.hooks, files.hooks],
    [configFiles.mcpServers, files.mcp],
    [configFiles.lspServers, files.lsp],
    [configFiles.monitors, files.monitors],
  ]);
  return paths.flatMap((path) => (layout.has(path) ? layout.get(path) : reads.texts.get(path)) ?? []);
}

/**
 * The facts of a plugin directory, read at the component locations of its manifest, with the license of the
 * marketplace entry when plugin.json states none.
 */
export function analyzePlugin({ directories, files }: Inspection, reads: ComponentReads, entryLicense?: string) {
  const plugin = readManifest(files.manifest);
  const version = versionLabel.safeParse(plugin.version);
  const experimentalValues = experimental.safeParse(plugin.experimental).data ?? {};
  const { folders, configs } = componentLocations(plugin, experimentalValues);
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
  const filesAt = (paths: readonly string[]) => locationFiles(reads, paths);
  return {
    ...(version.success ? { version: version.data } : {}),
    components: {
      skills: skillCount(plugin, directories, reads, folders.skills),
      agents: markdownFiles(filesAt(folders.agents)),
      commands: commandCount(plugin, filesAt(folders.commands)),
      hooksByEvent: hooksByEvent(hookConfigs),
      mcpServersByTransport: mcpServersByTransport(serverList),
      lspServers: lspServers([...parsed(configs.lspServers), ...inline(plugin.lspServers)]),
      outputStyles: ownFiles(filesAt(folders.outputStyles), '.md'),
      monitors: monitors([plugin.monitors, experimentalValues.monitors], parsed(configs.monitors)),
      binFiles: countEntries(directories.bin),
    },
    modules: hookModules([...parsed(configs.hooks), ...inlineHooks]),
    themesOrWorkflows: ownFiles(filesAt(folders.themes), '.json') + ownFiles(filesAt(folders.workflows), '.js') > 0,
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
