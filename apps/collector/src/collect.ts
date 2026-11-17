import { ZodError } from 'zod';
import { type Candidate, type Located, mergeCandidates } from './candidate.ts';
import { type DataFiles, dataFiles } from './data-files.ts';
import { applyExclusions, type Exclusions } from './exclusions.ts';
import type { Repository } from './github-contents.ts';
import { repositoryId } from './github-location.ts';
import type { HttpClient } from './http-client.ts';
import { type FileKind, type InspectedPlace, inspectionCandidates } from './inspection-candidates.ts';
import { issueSummary } from './issue-summary.ts';
import { type ItemFile, readItemFiles } from './item-files.ts';
import { UnknownLicenseError } from './license-class.ts';
import { mcpRegistryAdapter } from './mcp-registry-adapter.ts';
import { manifestLicense } from './plugin-analyzer.ts';
import { buildRecord, type ItemKind, type ItemRecord, type RecordInput } from './records.ts';
import { type RepositoryFacts, readFacts } from './repository-facts.ts';
import { inspectLocations } from './repository-tree.ts';
import type { RunReport } from './run-report.ts';
import type { SourceAdapter } from './source-adapter.ts';
import { searchTopics } from './topic-search.ts';

export interface CollectOptions {
  /** The adapters that read GitHub through the run's client. */
  adapters: readonly SourceAdapter[];
  /** The MCP Registry's own client, which sends no GitHub token. */
  registryClient: HttpClient;
  topics: readonly string[];
  excluded: Exclusions;
  /** The data files of the last run, so unchanged files keep their bytes. */
  previous: DataFiles;
  /** The run's start as an ISO date-time; its date is the run date. */
  runAt: string;
  log: (line: string) => void;
}

// Records per kind and run, most starred repositories first; it keeps a run well below the request cap.
const perKind = 60;
// Hooks and output styles are fewer; v1 keeps up to 20 of each.
const perSmallKind = 20;
const perTopic = 30;
// The MCP Registry lists tens of thousands of servers; 500 repositories keep their facts at 10 GitHub requests.
const serverRepositories = 500;
const kinds = [
  'marketplace',
  'plugin',
  'skill',
  'agent',
  'hook',
  'mcp-server',
  'output-style',
] as const satisfies readonly ItemKind[];

function isLocated(candidate: Candidate): candidate is Located {
  return candidate.location !== undefined;
}

function uniqueRepositories(repositories: readonly Repository[]): Repository[] {
  return [...new Map(repositories.map((repository) => [repositoryId(repository), repository])).values()];
}

/** A candidate with the facts of its repository. */
interface Ranked {
  candidate: Located;
  facts: RepositoryFacts;
}

/** The candidates of one kind whose repository GitHub found, most stars first, then by id. */
function ranked(candidates: readonly Located[], kind: ItemKind, facts: ReadonlyMap<string, RepositoryFacts>): Ranked[] {
  return candidates
    .flatMap((candidate) => {
      const found = facts.get(repositoryId(candidate.location));
      return candidate.kind === kind && found !== undefined ? [{ candidate, facts: found }] : [];
    })
    .toSorted(
      (first, second) => second.facts.stars - first.facts.stars || (first.candidate.id < second.candidate.id ? -1 : 1),
    );
}

/** What was read for a selected item: its record, nothing (it keeps its place without a record) or a refusal. */
type Read = ItemRecord | undefined | 'refused';

// A refill reads as many items as the round before refused; the bound keeps a run of refusals within the request cap.
const refills = 2;

/** Reads the ranked items in batches until `limit` of them are not refused; a refused item frees its place for the next. */
async function fill(
  items: readonly Ranked[],
  limit: number,
  read: (batch: readonly Ranked[]) => Promise<Read[]>,
  rounds = refills,
): Promise<ItemRecord[]> {
  const batch = items.slice(0, limit);
  if (batch.length === 0) return [];
  const kept = (await read(batch)).filter((one) => one !== 'refused');
  const rest = rounds === 0 ? [] : await fill(items.slice(batch.length), limit - kept.length, read, rounds - 1);
  return [...kept.filter((one) => one !== undefined), ...rest];
}

function countByKind(items: readonly { kind: ItemKind }[]): Record<ItemKind, number> {
  const counts: Record<ItemKind, number> = {
    marketplace: 0,
    plugin: 0,
    skill: 0,
    agent: 0,
    hook: 0,
    'mcp-server': 0,
    'output-style': 0,
  };
  for (const { kind } of items) counts[kind] += 1;
  return counts;
}

type Refuse = (id: string, error: Error) => void;

/** Logs a refusal by id, issue paths and codes only: an issue message could quote third-party text. */
function refusalLogger(log: (line: string) => void, counter: { refused: number }): Refuse {
  return (id, error) => {
    counter.refused += 1;
    const detail = error instanceof ZodError ? issueSummary(error, 'value') : error.message;
    log(`${id}: refused: ${detail}`);
  };
}

type Build = (input: RecordInput) => ItemRecord | 'refused';

/**
 * Builds a record, with the manifest license of the plugin that holds the item, or logs a refusal when its facts do not
 * fit the record or its license is unknown.
 */
function recordBuilder(runDate: string, refuse: Refuse, manifestLicenses: ReadonlyMap<string, string>): Build {
  return (input) => {
    const { container } = input.candidate;
    try {
      return buildRecord(
        container === undefined ? input : { ...input, containerLicense: manifestLicenses.get(container) },
        runDate,
      );
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof UnknownLicenseError)) throw error;
      refuse(input.candidate.id, error);
      return 'refused';
    }
  };
}

/** What every reader of selected items uses. */
interface Reading {
  client: HttpClient;
  refuse: Refuse;
  build: Build;
}

const tooLarge = 'a file is cut by GitHub or over the size cap';

/** The topic repositories that have an id; a name too long for one is refused, so it cannot stop the run. */
function identified(repositories: readonly Repository[], refuse: Refuse): Repository[] {
  return repositories.filter((repository) => {
    try {
      repositoryId(repository);
      return true;
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      refuse('topic search', error);
      return false;
    }
  });
}

/** Inspects each place and returns the items they hold; a place with a file over its size cap is refused. */
async function inspectPlaces(client: HttpClient, places: readonly InspectedPlace[], refuse: Refuse) {
  const inspections = await inspectLocations(
    client,
    places.map((place) => place.location),
  );
  const found: Candidate[] = [];
  for (const [index, place] of places.entries()) {
    const inspection = inspections[index];
    if (inspection === 'too-large') refuse(place.container ?? repositoryId(place.location), new Error(tooLarge));
    else if (inspection !== undefined) found.push(...inspectionCandidates(place, inspection, refuse));
  }
  return { inspections, found };
}

/**
 * Inspects a batch of plugins and adds the items they hold to `found` and their manifest licenses to `manifestLicenses`,
 * also those of a plugin refused for its own facts.
 */
function pluginReader({ client, refuse, build }: Reading, found: Candidate[], manifestLicenses: Map<string, string>) {
  return async (batch: readonly Ranked[]): Promise<Read[]> => {
    const places = batch.map(
      ({ candidate: { location, id, provenance } }): InspectedPlace => ({ location, container: id, provenance }),
    );
    const inspected = await inspectPlaces(client, places, refuse);
    found.push(...inspected.found);
    return batch.map(({ candidate, facts }, index): Read => {
      const [inspection, source] = [inspected.inspections[index], candidate.source];
      if (inspection === 'too-large') return 'refused';
      if (inspection === undefined) return undefined;
      const license = manifestLicense(inspection.files.manifest);
      if (license !== undefined) manifestLicenses.set(candidate.id, license);
      if (source === undefined) return undefined;
      return build({ kind: 'plugin', candidate, facts, inspection, source });
    });
  };
}

function fileRecord(kind: FileKind, { candidate, facts }: Ranked, read: ItemFile | undefined, reading: Reading): Read {
  if (read?.file === 'too-large') {
    reading.refuse(candidate.id, new Error(tooLarge));
    return 'refused';
  }
  const text = read?.file.text;
  if (read === undefined || text === undefined) return undefined;
  const { folders, tests, licenseFile } = read;
  return reading.build(
    kind === 'skill' ? { kind, candidate, facts, text, folders, tests, licenseFile } : { kind, candidate, facts, text },
  );
}

/** Reads a batch of skills' SKILL.md and folders, or of agents' or output styles' own files, and builds their records. */
function fileReader(reading: Reading, kind: FileKind) {
  return async (batch: readonly Ranked[]): Promise<Read[]> => {
    const skill = kind === 'skill';
    const files = await readItemFiles(
      reading.client,
      batch.map(({ candidate: { location } }) => ({ location, file: skill ? 'SKILL.md' : '' })),
      skill,
    );
    return batch.map((item, index) => fileRecord(kind, item, files[index], reading));
  };
}

function marketplaceRecords(
  candidates: readonly Located[],
  facts: ReadonlyMap<string, RepositoryFacts>,
  build: Build,
): ItemRecord[] {
  return candidates.flatMap((candidate): ItemRecord[] => {
    const found = facts.get(repositoryId(candidate.location));
    if (candidate.kind !== 'marketplace' || candidate.entries === undefined || found === undefined) return [];
    const record = build({ kind: 'marketplace', candidate, facts: found, entries: candidate.entries });
    return record === 'refused' ? [] : [record];
  });
}

/** Builds the records of a batch of hooks or MCP servers, whose facts were read with their candidates. */
function listedReader({ build }: Reading) {
  return (batch: readonly Ranked[]): Promise<Read[]> =>
    Promise.resolve(
      batch.map(({ candidate, facts }): Read => {
        const { hooks, mcpServer } = candidate;
        if (candidate.kind === 'hook')
          return hooks === undefined ? undefined : build({ kind: 'hook', candidate, facts, hooks });
        return mcpServer === undefined ? undefined : build({ kind: 'mcp-server', candidate, facts, mcpServer });
      }),
    );
}

/**
 * The repositories to read facts of: each listed and topic repository, and the MCP server repositories up to the budget
 * in the registry adapter's name order; a server past the budget gets no facts, so no record.
 */
function factsRepositories(
  listed: readonly Located[],
  topicRepositories: readonly Repository[],
  log: (line: string) => void,
) {
  const locations = (servers: boolean) =>
    listed.filter(({ kind }) => (kind === 'mcp-server') === servers).map(({ location }) => location);
  const servers = uniqueRepositories(locations(true));
  if (servers.length > serverRepositories)
    log(`mcp-registry: facts of the first ${serverRepositories} of ${servers.length} server repositories`);
  return uniqueRepositories([...locations(false), ...topicRepositories, ...servers.slice(0, serverRepositories)]);
}

/** Each topic repository GitHub found as a place to inspect. */
function topicPlaces(topicRepositories: readonly Repository[], facts: ReadonlyMap<string, RepositoryFacts>) {
  return topicRepositories
    .filter((repository) => facts.has(repositoryId(repository)))
    .map(
      (repository): InspectedPlace => ({
        location: { ...repository, path: '', ref: 'HEAD' },
        provenance: ['github'],
      }),
    );
}

/**
 * The run's records: every marketplace, the selected plugins and the most starred items of the other kinds; a refused
 * item frees its place.
 */
async function itemRecords(
  reading: Reading,
  {
    candidates,
    facts,
    plugins,
  }: { candidates: readonly Located[]; facts: ReadonlyMap<string, RepositoryFacts>; plugins: readonly ItemRecord[] },
): Promise<ItemRecord[]> {
  const select = (kind: ItemKind, limit: number) =>
    fill(
      ranked(candidates, kind, facts),
      limit,
      kind === 'skill' || kind === 'agent' || kind === 'output-style'
        ? fileReader(reading, kind)
        : listedReader(reading),
    );
  const [skills, agents, hooks, mcpServers, outputStyles] = await Promise.all([
    select('skill', perKind),
    select('agent', perKind),
    select('hook', perSmallKind),
    select('mcp-server', perKind),
    select('output-style', perSmallKind),
  ]);
  return [
    ...marketplaceRecords(candidates, facts, reading.build),
    ...plugins,
    ...skills,
    ...agents,
    ...hooks,
    ...mcpServers,
    ...outputStyles,
  ];
}

/** Reads every source, inspects the selected items on GitHub and returns the run report and the data files. */
export async function collect(
  client: HttpClient,
  options: CollectOptions,
): Promise<{ report: RunReport; files: Map<string, string> }> {
  const { log, runAt, excluded } = options;
  const runDate = runAt.slice(0, 10);
  const counter = { refused: 0 };
  const refuse = refusalLogger(log, counter);
  // A failed source fails the run, so the registry crawl stops reading pages nobody will use.
  const failed = new AbortController();
  const results = await Promise.all([
    ...options.adapters.map((adapter) => adapter.collect(client, log)),
    mcpRegistryAdapter(options.previous, runAt, failed.signal).collect(options.registryClient, log),
  ]).catch((error: unknown) => {
    failed.abort();
    throw error;
  });
  counter.refused += results.reduce((sum, result) => sum + result.refused, 0);
  const listed = applyExclusions(mergeCandidates(results.flatMap((result) => result.candidates)), excluded).filter(
    isLocated,
  );
  // An excluded repository found by topic is not inspected, so the items it holds stay out too.
  const topicRepositories = identified(await searchTopics(client, options.topics, perTopic), refuse).filter(
    (repository) => !excluded.has(repositoryId(repository)),
  );
  const facts = await readFacts(client, factsRepositories(listed, topicRepositories, log), runDate);
  // Filled while the plugins are read, before the items they hold are built.
  const manifestLicenses = new Map<string, string>();
  const reading: Reading = { client, refuse, build: recordBuilder(runDate, refuse, manifestLicenses) };
  const found: Candidate[] = [];
  const [plugins, topics] = await Promise.all([
    fill(ranked(listed, 'plugin', facts), perKind, pluginReader(reading, found, manifestLicenses)),
    inspectPlaces(client, topicPlaces(topicRepositories, facts), refuse),
  ]);
  const all = mergeCandidates([...results.flatMap((result) => result.candidates), ...found, ...topics.found]);
  const kept = applyExclusions(all, excluded);
  const records = await itemRecords(reading, { candidates: kept.filter(isLocated), facts, plugins });
  const report: RunReport = {
    format: 'directory-run-report',
    schemaVersion: 4,
    runAt,
    requests: client.requests + options.registryClient.requests,
    refused: counter.refused,
    excluded: all.length - kept.length,
    discovered: countByKind(kept),
    items: countByKind(records),
    sources: results.flatMap(({ read }) => (read === undefined ? [] : [read])),
  };
  return { report, files: dataFiles(records, facts, options.previous, runDate) };
}

export function summaryLine({ items, discovered, excluded, refused, requests }: RunReport): string {
  const counts = kinds.map((kind) => `${items[kind]} of ${discovered[kind]} ${kind}`).join(', ');
  return `collect: ${counts} items; ${excluded} excluded, ${refused} refused; ${requests} requests`;
}
