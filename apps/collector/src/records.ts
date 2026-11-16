import {
  agentRecord,
  hookRecord,
  marketplaceRecord,
  mcpServerRecord,
  outputStyleRecord,
  pluginRecord,
  type Pin,
  type SourceId,
  type SourceKind,
  skillRecord,
} from '@directory/contracts';
import type { z } from 'zod';
import { analyzeAgent } from './agent-analyzer.ts';
import type { Candidate, Located } from './candidate.ts';
import { repositoryId } from './github-location.ts';
import type { HookFacts } from './hook-analyzer.ts';
import type { SkillFolders } from './item-files.ts';
import { licenseOf } from './license-class.ts';
import { analyzeMarketplace, type MarketplaceEntries } from './marketplace-analyzer.ts';
import type { McpServerFacts } from './mcp-server-analyzer.ts';
import { analyzeOutputStyle } from './output-style-analyzer.ts';
import { analyzePlugin } from './plugin-analyzer.ts';
import type { RepositoryFacts } from './repository-facts.ts';
import type { Inspection } from './repository-tree.ts';
import { analyzeSkill } from './skill-analyzer.ts';

export type ItemKind = Candidate['kind'];

type RecordValue =
  | z.infer<typeof marketplaceRecord>
  | z.infer<typeof pluginRecord>
  | z.infer<typeof skillRecord>
  | z.infer<typeof agentRecord>
  | z.infer<typeof hookRecord>
  | z.infer<typeof mcpServerRecord>
  | z.infer<typeof outputStyleRecord>;

/** A record that passed its contract, the repository whose popularity file it points to and that repository's owner. */
export interface ItemRecord {
  kind: ItemKind;
  id: string;
  repository: string;
  owner: string;
  value: RecordValue;
}

/** What a record is built from: the candidate, its repository's facts and what was read for its kind. */
export type RecordInput = { candidate: Located; facts: RepositoryFacts } & (
  | { kind: 'marketplace'; entries: MarketplaceEntries }
  | { kind: 'plugin'; inspection: Inspection; source: { kind: SourceKind; pin: Pin } }
  | { kind: 'skill'; text: string; folders: SkillFolders }
  | { kind: 'agent'; text: string }
  | { kind: 'hook'; hooks: HookFacts }
  | { kind: 'mcp-server'; mcpServer: McpServerFacts }
  | { kind: 'output-style'; text: string }
);
type InputOf<K extends ItemKind> = Extract<RecordInput, { kind: K }>;

const sourceOrder: readonly SourceId[] = [
  'official-marketplace',
  'community-marketplace',
  'anthropic-marketplaces',
  'github',
  'mcp-registry',
  'seeds',
];

function baseFields({ candidate, facts }: RecordInput, runDate: string, declaredLicense?: string) {
  const repository = repositoryId(candidate.location);
  const pointer = { ref: repository, scope: 'repository', source: 'github' } as const;
  const provenance = new Set<SourceId>([...candidate.provenance, 'github']);
  return {
    schemaVersion: 1,
    id: candidate.id,
    name: candidate.name,
    aliases: [],
    links: candidate.links,
    ...(candidate.container === undefined ? {} : { container: candidate.container }),
    listedIn: candidate.listedIn,
    license: licenseOf(facts.license, declaredLicense),
    ...(facts.maintenance === undefined ? {} : { maintenance: facts.maintenance }),
    popularity: [
      { signal: 'stars', ...pointer },
      { signal: 'starsGained30d', ...pointer },
    ],
    signals: {},
    flags: [],
    tags: [],
    cedarloomFit: { label: 'not-assessed', tags: [] },
    provenance: sourceOrder.filter((source) => provenance.has(source)),
    changedAt: runDate,
  };
}

function marketplace(input: InputOf<'marketplace'>, runDate: string) {
  return marketplaceRecord.parse({
    ...baseFields(input, runDate),
    kind: 'marketplace',
    ...analyzeMarketplace(input.entries),
    ownerType: input.facts.ownerType,
  });
}

function plugin(input: InputOf<'plugin'>, runDate: string) {
  return pluginRecord.parse({
    ...baseFields(input, runDate),
    kind: 'plugin',
    ...analyzePlugin(input.inspection),
    // The dependency format is not read yet.
    dependencies: [],
    sourceKind: input.source.kind,
    pin: input.source.pin,
  });
}

function skill(input: InputOf<'skill'>, runDate: string) {
  const { name, declaredLicense, ...facts } = analyzeSkill(input.text);
  return skillRecord.parse({
    ...baseFields(input, runDate, declaredLicense),
    ...(name === undefined ? {} : { name }),
    kind: 'skill',
    ...facts,
    files: input.folders,
  });
}

function agent(input: InputOf<'agent'>, runDate: string) {
  const { name, ...facts } = analyzeAgent(input.text);
  return agentRecord.parse({
    ...baseFields(input, runDate),
    ...(name === undefined ? {} : { name }),
    kind: 'agent',
    ...facts,
  });
}

function hook(input: InputOf<'hook'>, runDate: string) {
  return hookRecord.parse({ ...baseFields(input, runDate), kind: 'hook', ...input.hooks });
}

function mcpServer(input: InputOf<'mcp-server'>, runDate: string) {
  return mcpServerRecord.parse({ ...baseFields(input, runDate), kind: 'mcp-server', ...input.mcpServer });
}

function outputStyle(input: InputOf<'output-style'>, runDate: string) {
  return outputStyleRecord.parse({
    ...baseFields(input, runDate),
    kind: 'output-style',
    ...analyzeOutputStyle(input.text),
  });
}

function recordValue(input: RecordInput, runDate: string): ItemRecord['value'] {
  if (input.kind === 'marketplace') return marketplace(input, runDate);
  if (input.kind === 'plugin') return plugin(input, runDate);
  if (input.kind === 'skill') return skill(input, runDate);
  if (input.kind === 'agent') return agent(input, runDate);
  if (input.kind === 'hook') return hook(input, runDate);
  if (input.kind === 'mcp-server') return mcpServer(input, runDate);
  return outputStyle(input, runDate);
}

/** Builds the record of one item and parses it with its contract; a refused record throws a ZodError. */
export function buildRecord(input: RecordInput, runDate: string): ItemRecord {
  const { id, location } = input.candidate;
  return {
    kind: input.kind,
    id,
    repository: repositoryId(location),
    owner: location.owner,
    value: recordValue(input, runDate),
  };
}
