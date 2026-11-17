import { z } from 'zod';
import {
  count,
  date,
  dateTime,
  fitLabel,
  flag,
  gitSha,
  httpsUrl,
  itemId,
  itemName,
  keyword,
  kind,
  licenseClass,
  registryName,
  semver,
  share,
  sourceId,
  tag,
  versionLabel,
} from './fields.ts';
import { pin, sourceKind } from './plugin-source.ts';
import { spdxExpression } from './spdx-expression.ts';

// Strict objects throughout: a key outside the contract, such as a copied description, is refused.

// An item off the allow-listed hosts (a registry entry, a plugin on another git host) has no source link and no maintenance facts.
const links = z.strictObject({
  source: httpsUrl.optional(),
  homepage: httpsUrl.optional(),
  install: httpsUrl.optional(),
  registry: httpsUrl.optional(),
});

const maintenance = z.strictObject({
  pushedAt: dateTime,
  // Commit count in the 90 days before the run date, stored as a step so a quiet day does not change the record.
  recentCommits: z.enum(['none', '1-4', '5+']),
  latestRelease: z.strictObject({ tag: versionLabel, date }).optional(),
  archived: z.boolean(),
  headSha: gitSha,
});

const common = {
  schemaVersion: z.literal(1),
  id: itemId,
  name: itemName.describe(
    'The identifier of the item, never a display name: the manifest or frontmatter `name` of a marketplace, plugin, skill or agent, the registry name of an MCP server, the file stem of an output style (its frontmatter `name` is a display name), and for a hook the name of the plugin folder or repository that holds its hooks file.',
  ),
  aliases: z.array(itemId),
  links,
  container: itemId.optional(),
  listedIn: z.array(itemId),
  license: z.strictObject({
    spdx: spdxExpression.optional(),
    source: z.enum(['github-detected', 'manifest', 'frontmatter', 'license-file']).optional(),
    class: licenseClass,
  }),
  maintenance: maintenance.optional(),
  popularity: z.array(
    z.discriminatedUnion('signal', [
      z.strictObject({
        signal: z.literal('listed'),
        value: count,
        scope: z.enum(['item', 'repository', 'marketplace']),
        source: sourceId,
      }),
      // A pointer, not the value: the count lives in the popularity file, so a star change leaves the record as it is.
      z.strictObject({
        signal: z.enum(['stars', 'starsGained30d']),
        ref: itemId.describe('The id `gh.<owner>.<repo>` of the popularity file that holds the star snapshots.'),
        scope: z.literal('repository'),
        source: z.literal('github'),
      }),
    ]),
  ),
  signals: z.record(keyword, z.union([z.number(), z.boolean()])),
  flags: z.array(flag),
  tags: z.array(tag),
  cedarloomFit: z.strictObject({ label: fitLabel, tags: z.array(tag) }),
  score: z
    .strictObject({
      rubric: z.strictObject({ kind, version: semver }),
      total: z.number().min(0).max(100),
      parts: z.array(z.strictObject({ signal: keyword, points: z.number().min(0), max: z.number().min(0) })),
    })
    .optional()
    .describe('Stored apart from the raw signals; optional, and absent while no rubric has scored the record.'),
  provenance: z.array(sourceId),
  changedAt: date,
};

// Token figures are estimates: characters divided by 4.
const tokens = z.strictObject({ metadata: count, body: count });
const toolClass = z.enum(['read', 'write', 'bash', 'web', 'mcp', 'agent', 'other']);

export const marketplaceRecord = z.strictObject({
  ...common,
  kind: z.literal('marketplace'),
  pluginCount: count,
  sourceKinds: z.record(sourceKind, count),
  pinnedShare: share,
  ownerType: z.enum(['user', 'organization']),
});

export const pluginRecord = z.strictObject({
  ...common,
  kind: z.literal('plugin'),
  version: versionLabel.optional(),
  components: z.strictObject({
    skills: count,
    agents: count,
    commands: count,
    hooksByEvent: z.record(keyword, count),
    mcpServersByTransport: z.partialRecord(z.enum(['stdio', 'http', 'sse']), count),
    lspServers: count,
    outputStyles: count,
    monitors: count,
    binFiles: count,
  }),
  dependencies: z.array(itemId),
  hasEvals: z.boolean(),
  sourceKind,
  pin,
});

export const skillRecord = z.strictObject({
  ...common,
  kind: z.literal('skill'),
  frontmatterFields: z.array(keyword),
  bodyLines: count,
  tokens,
  allowedTools: z.array(toolClass),
  files: z.strictObject({ scripts: count, references: count, assets: count }),
});

export const agentRecord = z.strictObject({
  ...common,
  kind: z.literal('agent'),
  toolsDeclared: z.boolean(),
  toolClasses: z.array(toolClass),
  modelSet: z.boolean(),
  tokens,
});

export const hookRecord = z.strictObject({
  ...common,
  kind: z.literal('hook'),
  events: z.array(keyword).max(64),
  handlerTypes: z.array(z.enum(['command', 'http', 'prompt', 'agent'])),
  commandForms: z.array(z.enum(['shell', 'exec'])),
  matcherBreadth: z.enum(['match-all', 'specific', 'none']),
});

export const mcpServerRecord = z.strictObject({
  ...common,
  kind: z.literal('mcp-server'),
  name: registryName.describe('The registry name of the MCP server, `<namespace>/<name>`.'),
  links: links.extend({ registry: httpsUrl }),
  version: versionLabel.optional().describe('The registry version; absent when it is no version label.'),
  registryStatus: z.enum(['active', 'deprecated']),
  transports: z.array(z.enum(['stdio', 'streamable-http', 'sse'])),
  packageRegistryTypes: z.array(z.enum(['npm', 'pypi', 'oci', 'nuget', 'mcpb', 'cargo'])),
  versionPinned: z.boolean().describe('Every package names an exact version; also true for a server without packages.'),
  requiredSecrets: count,
  remoteHosts: count,
});

export const outputStyleRecord = z.strictObject({
  ...common,
  kind: z.literal('output-style'),
  tokens: count,
  frontmatterFields: z.array(keyword).max(64),
});

/** A record of any kind. */
export type ItemRecord = z.infer<
  | typeof marketplaceRecord
  | typeof pluginRecord
  | typeof skillRecord
  | typeof agentRecord
  | typeof hookRecord
  | typeof mcpServerRecord
  | typeof outputStyleRecord
>;
