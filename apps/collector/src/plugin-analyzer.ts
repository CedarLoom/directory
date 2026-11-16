import { versionLabel } from '@directory/contracts';
import { z } from 'zod';
import { jsonText } from './json-text.ts';
import type { Entry, Inspection } from './repository-tree.ts';

// Upstream files carry more keys than these; only the keys a fact needs are read, the rest is stripped.
const manifest = z.object({
  version: z.unknown().optional(),
  hooks: z.unknown().optional(),
  mcpServers: z.unknown().optional(),
  lspServers: z.unknown().optional(),
});
const handlerGroups = z.record(z.string(), z.array(z.object({ hooks: z.array(z.unknown()) })));
// `hooks/hooks.json` wraps the events in `hooks`; an inline `hooks` value in plugin.json may give the events directly.
const hooksConfig = z.union([z.object({ hooks: handlerGroups }), handlerGroups.transform((hooks) => ({ hooks }))]);
const servers = z.record(z.string(), z.object({ type: z.string().optional() }));
const mcpConfig = z.union([z.object({ mcpServers: servers }), servers.transform((mcpServers) => ({ mcpServers }))]);
const lspConfig = z.record(z.string(), z.unknown());

const transports: Readonly<Record<string, 'stdio' | 'http' | 'sse'>> = { stdio: 'stdio', http: 'http', sse: 'sse' };

/** A manifest value that is an object holds the configuration inline; a path or a list of paths is not followed. */
function inline(value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function hooksByEvent(configs: readonly unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const config of configs) {
    if (config === undefined) continue;
    for (const [event, groups] of Object.entries(hooksConfig.parse(config).hooks))
      counts[event] = (counts[event] ?? 0) + groups.reduce((sum, group) => sum + group.hooks.length, 0);
  }
  return counts;
}

function mcpServersByTransport(configs: readonly unknown[]): Partial<Record<'stdio' | 'http' | 'sse', number>> {
  const counts: Partial<Record<'stdio' | 'http' | 'sse', number>> = {};
  for (const config of configs) {
    if (config === undefined) continue;
    for (const { type = 'stdio' } of Object.values(mcpConfig.parse(config).mcpServers)) {
      const transport = transports[type];
      if (transport !== undefined) counts[transport] = (counts[transport] ?? 0) + 1;
    }
  }
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

/** The facts of a plugin directory in the default layout; component paths a manifest adds are not followed. */
export function analyzePlugin({ directories, files }: Inspection) {
  const plugin = manifest.parse(parseFile(files.manifest) ?? {});
  const version = versionLabel.safeParse(plugin.version);
  return {
    ...(version.success ? { version: version.data } : {}),
    components: {
      skills: countEntries(directories.skills, false, 'tree'),
      agents: countEntries(directories.agents, true),
      commands: countEntries(directories.commands, true),
      hooksByEvent: hooksByEvent([parseFile(files.hooks), inline(plugin.hooks)]),
      mcpServersByTransport: mcpServersByTransport([parseFile(files.mcp), inline(plugin.mcpServers)]),
      lspServers: lspServers([parseFile(files.lsp), inline(plugin.lspServers)]),
      outputStyles: countEntries(directories.outputStyles, true),
      // The monitor format is not read yet.
      monitors: 0,
      binFiles: countEntries(directories.bin, false),
    },
    hasEvals: directories.root?.some((entry) => entry.name === 'evals') ?? false,
  };
}
