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
  semver,
  share,
  sourceId,
  spdxId,
  tag,
  versionLabel,
} from './fields.ts';
import { pin, sourceKind } from './plugin-source.ts';

// Strict objects throughout: a key outside the contract, such as a copied description, is refused.

const links = z.strictObject({
  source: httpsUrl,
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
  name: itemName,
  aliases: z.array(itemId),
  links,
  container: itemId.optional(),
  listedIn: z.array(itemId),
  license: z.strictObject({
    spdx: spdxId.optional(),
    source: z.enum(['github-detected', 'manifest', 'frontmatter']).optional(),
    class: licenseClass,
  }),
  maintenance,
  popularity: z.array(
    z.strictObject({
      signal: z.enum(['stars', 'listed']),
      value: count,
      scope: z.enum(['item', 'repository', 'marketplace']),
      source: sourceId,
    }),
  ),
  signals: z.record(keyword, z.union([z.number(), z.boolean()])),
  flags: z.array(flag),
  tags: z.array(tag),
  cedarloomFit: z.strictObject({ label: fitLabel, tags: z.array(tag) }),
  score: z.strictObject({
    rubric: z.strictObject({ kind, version: semver }),
    total: z.number().min(0).max(100),
    parts: z.array(z.strictObject({ signal: keyword, points: z.number().min(0), max: z.number().min(0) })),
  }),
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
  events: z.array(keyword),
  handlerTypes: z.array(z.enum(['command', 'http', 'prompt', 'agent'])),
  commandForms: z.array(z.enum(['shell', 'exec'])),
  matcherBreadth: z.enum(['match-all', 'specific', 'none']),
});

// A registry entry need not link a repository, so source and maintenance facts are optional here.
export const mcpServerRecord = z.strictObject({
  ...common,
  kind: z.literal('mcp-server'),
  links: links.extend({ source: httpsUrl.optional(), registry: httpsUrl }),
  maintenance: maintenance.optional(),
  registryStatus: z.enum(['active', 'deprecated']),
  transports: z.array(z.enum(['stdio', 'streamable-http', 'sse'])),
  packageRegistryTypes: z.array(z.enum(['npm', 'pypi', 'oci', 'nuget', 'mcpb'])),
  versionPinned: z.boolean(),
  requiredSecrets: count,
  remoteHosts: count,
});

export const outputStyleRecord = z.strictObject({
  ...common,
  kind: z.literal('output-style'),
  tokens: count,
  frontmatterFields: z.array(keyword),
});
