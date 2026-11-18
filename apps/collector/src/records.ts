import {
  agentRecord,
  hookRecord,
  type ItemRecord as RecordValue,
  marketplaceRecord,
  mcpServerRecord,
  outputStyleRecord,
  pluginRecord,
  type Pin,
  type SourceId,
  type SourceKind,
  skillRecord,
} from '@directory/contracts';
import { currentRubric, type Scorable, type Score, score } from '@directory/scoring';
import type { z } from 'zod';
import { analyzeAgent } from './agent-analyzer.ts';
import type { Candidate, Located } from './candidate.ts';
import { repositoryId } from './github-location.ts';
import type { HookFacts } from './hook-analyzer.ts';
import type { SkillFolders } from './item-files.ts';
import {
  type Assessment,
  agentAssessment,
  hookAssessment,
  marketplaceAssessment,
  mcpServerAssessment,
  outputStyleAssessment,
  pluginAssessment,
  skillAssessment,
} from './item-signals.ts';
import { licenseFileNames, licenseOf } from './license-class.ts';
import { analyzeMarketplace, type MarketplaceEntries } from './marketplace-analyzer.ts';
import type { McpServerFacts } from './mcp-server-analyzer.ts';
import { analyzeOutputStyle } from './output-style-analyzer.ts';
import { analyzePlugin } from './plugin-analyzer.ts';
import type { RepositoryFacts } from './repository-facts.ts';
import type { Inspection } from './repository-tree.ts';
import { analyzeSkill } from './skill-analyzer.ts';

export type ItemKind = Candidate['kind'];

/** A record that passed its contract, the repository whose popularity file it points to and that repository's owner. */
export interface ItemRecord {
  kind: ItemKind;
  id: string;
  repository: string;
  owner: string;
  value: RecordValue & { score: Score };
}

/**
 * What a record is built from: the candidate, its repository's facts, the license field of its containing plugin's
 * manifest, whether the item's folder is that plugin's folder, the text of the license file in the item's own folder,
 * and what was read for its kind.
 */
export type RecordInput = {
  candidate: Located;
  facts: RepositoryFacts;
  containerLicense?: string | undefined;
  inContainerFolder?: boolean;
  folderLicenseText?: string | undefined;
} & (
  | { kind: 'marketplace'; entries: MarketplaceEntries }
  | { kind: 'plugin'; inspection: Inspection; source: { kind: SourceKind; pin: Pin } }
  | { kind: 'skill'; text: string; folders: SkillFolders; tests: boolean; licenseFile: boolean }
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

/** The fields every kind shares; a release or a version label counts as a release. */
function baseFields(
  { candidate, facts, containerLicense, inContainerFolder, folderLicenseText }: RecordInput,
  runDate: string,
  { signals, flags, version }: Assessment & { version?: string | undefined },
  license: Parameters<typeof licenseOf>[1] = {},
) {
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
    license: licenseOf(facts.license, {
      ...license,
      container: containerLicense,
      containerFolder: inContainerFolder,
      folderLicenseText,
      // At the repository root, the item's license file is also the one GitHub reads.
      ...(candidate.location.path === '' ? { rootLicenseText: folderLicenseText } : {}),
    }),
    ...(facts.maintenance === undefined ? {} : { maintenance: facts.maintenance }),
    popularity: [
      { signal: 'stars', ...pointer },
      { signal: 'starsGained30d', ...pointer },
    ],
    signals: { release: facts.maintenance?.latestRelease !== undefined || version !== undefined, ...signals },
    flags,
    tags: [],
    cedarloomFit: { label: 'not-assessed', tags: [] },
    provenance: sourceOrder.filter((source) => provenance.has(source)),
    changedAt: runDate,
  };
}

/** Parses the record with its score, which the scorer computes from the fields the contract then checks. */
function scored<T extends z.ZodType<RecordValue>>(
  contract: T,
  fields: Scorable & Record<string, unknown>,
  runDate: string,
): z.output<T> & { score: Score } {
  const value = score(fields, currentRubric(fields.kind), runDate);
  return { ...contract.parse({ ...fields, score: value }), score: value };
}

function marketplace(input: InputOf<'marketplace'>, runDate: string) {
  return scored(
    marketplaceRecord,
    {
      ...baseFields(input, runDate, marketplaceAssessment(input.entries)),
      kind: 'marketplace',
      ...analyzeMarketplace(input.entries),
      ownerType: input.facts.ownerType,
    },
    runDate,
  );
}

function plugin(input: InputOf<'plugin'>, runDate: string) {
  // The scoring-only facts stay out of the record; the manifest license feeds the record's license.
  const {
    manifestName,
    manifestFields,
    manifestLicense,
    rootClaudeMd,
    hooks,
    mcpUnpinnedPackage,
    mcpSecretsRequired,
    modules,
    uncountedComponents,
    ...facts
  } = analyzePlugin(input.inspection, input.candidate.entryLicense);
  const assessment = pluginAssessment({
    ...facts,
    modules,
    uncountedComponents,
    name: manifestName ?? input.candidate.name,
    manifestFields,
    rootClaudeMd,
    hooks,
    mcpUnpinnedPackage,
    mcpSecretsRequired,
    source: input.source,
    listedIn: input.candidate.listedIn,
  });
  return scored(
    pluginRecord,
    {
      ...baseFields(
        input,
        runDate,
        { ...assessment, version: facts.version },
        {
          manifest: manifestLicense,
          folderLicenseFile: licenseFileNames(input.inspection.directories.root).length > 0,
        },
      ),
      kind: 'plugin',
      ...facts,
      // The dependency format is not read yet.
      dependencies: [],
      sourceKind: input.source.kind,
      pin: input.source.pin,
    },
    runDate,
  );
}

function skill(input: InputOf<'skill'>, runDate: string) {
  const analysis = analyzeSkill(input.text);
  // The scoring-only facts stay out of the record.
  const {
    name,
    declaredLicense,
    declaredName: _declaredName,
    descriptionLength: _descriptionLength,
    unrestrictedBash: _unrestrictedBash,
    ...facts
  } = analysis;
  const assessment = skillAssessment(
    { ...analysis, scripts: input.folders.scripts, tests: input.tests },
    // A repository that is one skill has no skill folder; its clone folder is named by whoever clones it.
    input.candidate.location.path === '' ? undefined : input.candidate.name,
  );
  return scored(
    skillRecord,
    {
      ...baseFields(input, runDate, assessment, { declared: declaredLicense, folderLicenseFile: input.licenseFile }),
      ...(name === undefined ? {} : { name }),
      kind: 'skill',
      ...facts,
      files: input.folders,
    },
    runDate,
  );
}

function agent(input: InputOf<'agent'>, runDate: string) {
  const analysis = analyzeAgent(input.text);
  const {
    name,
    declaredName: _declaredName,
    descriptionLength: _descriptionLength,
    bodyLines: _bodyLines,
    unrestrictedBash: _unrestrictedBash,
    ...facts
  } = analysis;
  return scored(
    agentRecord,
    {
      ...baseFields(input, runDate, agentAssessment(analysis)),
      ...(name === undefined ? {} : { name }),
      kind: 'agent',
      ...facts,
    },
    runDate,
  );
}

function hook(input: InputOf<'hook'>, runDate: string) {
  const { networkIndicator: _networkIndicator, ...facts } = input.hooks;
  return scored(
    hookRecord,
    { ...baseFields(input, runDate, hookAssessment(input.hooks)), kind: 'hook', ...facts },
    runDate,
  );
}

function mcpServer(input: InputOf<'mcp-server'>, runDate: string) {
  const { candidate, mcpServer: server } = input;
  const assessment = mcpServerAssessment(server, candidate.name, candidate.location.owner);
  return scored(
    mcpServerRecord,
    { ...baseFields(input, runDate, { ...assessment, version: server.version }), kind: 'mcp-server', ...server },
    runDate,
  );
}

function outputStyle(input: InputOf<'output-style'>, runDate: string) {
  const { named, described, bodyLines, ...facts } = analyzeOutputStyle(input.text);
  const assessment = outputStyleAssessment({ named, described, bodyLines, tokens: facts.tokens });
  return scored(
    outputStyleRecord,
    { ...baseFields(input, runDate, assessment), kind: 'output-style', ...facts },
    runDate,
  );
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
