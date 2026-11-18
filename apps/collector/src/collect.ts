import { isDeepStrictEqual } from 'node:util';
import { ZodError } from 'zod';
import { type Candidate, type Located, mergeCandidates } from './candidate.ts';
import { type DataFiles, dataFiles } from './data-files.ts';
import { applyExclusions, type Exclusions } from './exclusions.ts';
import type { Repository } from './github-contents.ts';
import { type GitHubLocation, repositoryId } from './github-location.ts';
import type { HttpClient } from './http-client.ts';
import { type FileKind, type InspectedPlace, inspectionCandidates } from './inspection-candidates.ts';
import { issueSummary } from './issue-summary.ts';
import { type ItemFile, readItemFiles } from './item-files.ts';
import { detectedLicenseFileNames, licenseFileNames, UnknownLicenseError } from './license-class.ts';
import { mcpRegistryAdapter } from './mcp-registry-adapter.ts';
import { manifestLicense } from './plugin-analyzer.ts';
import { buildRecord, type ItemKind, type ItemRecord, type RecordInput } from './records.ts';
import { type RepositoryFacts, readFacts } from './repository-facts.ts';
import { inspectLocations, manifestPath } from './repository-tree.ts';
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
  // A round starts at an index rather than a copy of the rest, as an unbounded fill can run one round per item.
  const round = async (start: number, open: number, left: number): Promise<ItemRecord[]> => {
    const batch = items.slice(start, start + open);
    if (batch.length === 0) return [];
    const kept = (await read(batch)).filter((one) => one !== 'refused');
    const rest = left === 0 ? [] : await round(start + batch.length, open - kept.length, left - 1);
    return [...kept.filter((one) => one !== undefined), ...rest];
  };
  return round(0, limit, rounds);
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

const tooLarge = 'a file is cut by GitHub or over the size cap';
// A plugin manifest whose license cannot be read refuses the items the plugin holds.
const unreadManifest = { 'too-large': tooLarge, invalid: 'the manifest of its plugin is no JSON object' } as const;

/**
 * The listed plugins and the topic repositories with a plugin manifest at their root, by id: where each lives and the
 * license field of each manifest read so far.
 */
interface Containers {
  locations: Map<string, GitHubLocation>;
  /** The license field of each listed plugin's marketplace entry, its manifest's when plugin.json states none. */
  entryLicenses: ReadonlyMap<string, string>;
  /** Filled before the items a plugin holds are built. */
  licenses: Map<string, { license: string | undefined } | keyof typeof unreadManifest>;
}

/** The listed plugins as containers, before any manifest is read. */
function listedContainers(listed: readonly Located[]): Containers {
  const plugins = listed.filter(({ kind }) => kind === 'plugin');
  return {
    locations: new Map(plugins.map(({ id, location }) => [id, location])),
    entryLicenses: new Map(
      plugins.flatMap(({ id, entryLicense }) => (entryLicense === undefined ? [] : [[id, entryLicense]])),
    ),
    licenses: new Map(),
  };
}

/**
 * Builds a record, with the manifest license of the plugin that holds the item, or logs a refusal when its facts do not
 * fit the record, its license is unknown or its plugin's manifest is too large or no JSON object.
 */
function recordBuilder(runDate: string, refuse: Refuse, { locations, licenses }: Containers): Build {
  return (input) => {
    const { container, id, location } = input.candidate;
    const manifest = container === undefined ? undefined : licenses.get(container);
    if (typeof manifest === 'string') {
      refuse(id, new Error(unreadManifest[manifest]));
      return 'refused';
    }
    const plugin = container === undefined ? undefined : locations.get(container);
    try {
      // An item lives in its plugin's repository, so the same path is the plugin's own folder.
      return buildRecord(
        plugin === undefined
          ? input
          : {
              ...input,
              containerLicense: manifest?.license,
              inContainerFolder: plugin.path === location.path,
            },
        runDate,
      );
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof UnknownLicenseError)) throw error;
      refuse(id, error);
      return 'refused';
    }
  };
}

/** What every reader of selected items uses. */
interface Reading {
  client: HttpClient;
  refuse: Refuse;
  build: Build;
  containers: Containers;
}

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
 * What a record is built from, the license files in the item's own folder and the files of that folder GitHub's license
 * detection reads at a repository root.
 */
interface Unbuilt {
  input: RecordInput;
  licenseFiles: readonly string[];
  detectedLicenseFiles: readonly string[];
}

/**
 * Builds each record; one whose license is the license file in its folder, or at the repository root one whose license
 * file GitHub cannot name, is built again with the file's text when the folder holds just that one, so that only a file
 * that decides the record is read.
 */
async function buildRecords(
  { client, build }: Reading,
  items: readonly (Unbuilt | 'refused' | undefined)[],
): Promise<Read[]> {
  const records = items.map((item) => (typeof item === 'object' ? build(item.input) : item));
  const targets = items.flatMap((item, index) => {
    const record = records[index];
    if (typeof item !== 'object' || typeof record !== 'object') return [];
    const { location } = item.input.candidate;
    const [file, ...others] = item.licenseFiles;
    const { license } = record.value;
    // GitHub's NOASSERTION is the only detected license without an SPDX id. It may come from another file GitHub reads,
    // such as PATENTS, so the one license file names the root only when it is the only file GitHub reads there.
    const decides =
      license.source === 'license-file' ||
      (location.path === '' &&
        license.source === 'github-detected' &&
        license.spdx === undefined &&
        isDeepStrictEqual(item.detectedLicenseFiles, [file]));
    return decides && file !== undefined && others.length === 0 ? [{ index, input: item.input, location, file }] : [];
  });
  const reads = await readItemFiles(client, targets, false);
  for (const [at, { index, input }] of targets.entries()) {
    const file = reads[at]?.file;
    // A license file over the size cap is no reason to refuse the item; it stays unnamed.
    if (file !== undefined && file !== 'too-large') records[index] = build({ ...input, folderLicenseText: file.text });
  }
  return records;
}

/**
 * Inspects a batch of plugins and adds the items they hold to `found` and their manifest licenses to the containers,
 * also those of a plugin refused for its own facts.
 */
function pluginReader(reading: Reading, found: Candidate[]) {
  const { client, refuse, containers } = reading;
  return async (batch: readonly Ranked[]): Promise<Read[]> => {
    const places = batch.map(
      ({ candidate: { location, id, provenance } }): InspectedPlace => ({ location, container: id, provenance }),
    );
    const inspected = await inspectPlaces(client, places, refuse);
    found.push(...inspected.found);
    const unbuilt = batch.map(({ candidate, facts }, index): Unbuilt | 'refused' | undefined => {
      const [inspection, source] = [inspected.inspections[index], candidate.source];
      if (inspection === 'too-large') return 'refused';
      if (inspection === undefined) return undefined;
      containers.licenses.set(candidate.id, manifestLicense(inspection.files.manifest, candidate.entryLicense));
      if (source === undefined) return undefined;
      return {
        input: { kind: 'plugin', candidate, facts, inspection, source },
        licenseFiles: licenseFileNames(inspection.directories.root),
        detectedLicenseFiles: detectedLicenseFileNames(inspection.directories.root),
      };
    });
    return buildRecords(reading, unbuilt);
  };
}

function fileInput(
  kind: FileKind,
  { candidate, facts }: Ranked,
  read: ItemFile | undefined,
  refuse: Refuse,
): Unbuilt | 'refused' | undefined {
  if (read?.file === 'too-large') {
    refuse(candidate.id, new Error(tooLarge));
    return 'refused';
  }
  const text = read?.file.text;
  if (read === undefined || text === undefined) return undefined;
  const { folders, tests, licenseFiles, detectedLicenseFiles } = read;
  return {
    input:
      kind === 'skill'
        ? { kind, candidate, facts, text, folders, tests, licenseFile: licenseFiles.length > 0 }
        : { kind, candidate, facts, text },
    licenseFiles,
    detectedLicenseFiles,
  };
}

/**
 * Reads the manifest license of each plugin that holds an item of the batch and that no inspection read, such as a
 * plugin outside the selection whose marketplace entry lists skills.
 */
async function readManifestLicenses({ client, containers }: Reading, batch: readonly Ranked[]): Promise<void> {
  const { locations, entryLicenses, licenses } = containers;
  const unread = new Set(
    batch.flatMap(({ candidate: { container } }) =>
      container === undefined || licenses.has(container) ? [] : [container],
    ),
  );
  const plugins = [...unread].flatMap((id) => {
    const location = locations.get(id);
    return location === undefined ? [] : [{ id, location }];
  });
  const manifests = await readItemFiles(
    client,
    plugins.map(({ location }) => ({ location, file: manifestPath })),
    false,
  );
  for (const [index, { id }] of plugins.entries()) {
    const file = manifests[index]?.file;
    licenses.set(id, file === 'too-large' ? file : manifestLicense(file?.text, entryLicenses.get(id)));
  }
}

/** Reads a batch of skills' SKILL.md, folders and license file, or of agents' or output styles' own files, and builds their records. */
function fileReader(reading: Reading, kind: FileKind) {
  return async (batch: readonly Ranked[]): Promise<Read[]> => {
    const skill = kind === 'skill';
    const [files] = await Promise.all([
      readItemFiles(
        reading.client,
        batch.map(({ candidate: { location } }) => ({ location, file: skill ? 'SKILL.md' : '' })),
        skill,
      ),
      readManifestLicenses(reading, batch),
    ]);
    return buildRecords(
      reading,
      batch.map((item, index) => fileInput(kind, item, files[index], reading.refuse)),
    );
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

/**
 * Builds the records of a batch of hooks or MCP servers, whose facts were read with their candidates, after reading the
 * manifest license of each plugin that holds one and that no inspection read.
 */
function listedReader(reading: Reading) {
  return async (batch: readonly Ranked[]): Promise<Read[]> => {
    await readManifestLicenses(reading, batch);
    return batch.map(({ candidate, facts }): Read => {
      const { hooks, mcpServer } = candidate;
      if (candidate.kind === 'hook')
        return hooks === undefined ? undefined : reading.build({ kind: 'hook', candidate, facts, hooks });
      return mcpServer === undefined ? undefined : reading.build({ kind: 'mcp-server', candidate, facts, mcpServer });
    });
  };
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
 * The id of the listed plugin at the root of a repository: the one whose id is the repository's, else the only one the
 * repository's own marketplace lists there.
 */
function listedRootPlugin(locations: ReadonlyMap<string, GitHubLocation>, id: string): string | undefined {
  if (locations.has(id)) return id;
  const roots = [...locations.entries()].filter(
    ([, location]) => location.path === '' && repositoryId(location) === id,
  );
  // Several plugins at one root leave no plugin to hold its items.
  return roots.length === 1 ? roots[0]?.[0] : undefined;
}

/**
 * The items found in the topic repositories, those of a repository whose root is a listed plugin or holds a plugin
 * manifest with that plugin as their container, like the items of a listed plugin, and the manifest license of an
 * unlisted one added to the containers.
 */
async function topicItems(
  { client, refuse, containers: { locations, licenses } }: Reading,
  places: readonly InspectedPlace[],
): Promise<Candidate[]> {
  const { inspections, found } = await inspectPlaces(client, places, refuse);
  const plugins = new Map<string, string>();
  for (const [index, { location }] of places.entries()) {
    const inspection = inspections[index];
    if (typeof inspection !== 'object') continue;
    const id = repositoryId(location);
    // A listed plugin at the repository root keeps its own location and pin, whose manifest its reading records.
    const listed = listedRootPlugin(locations, id);
    if (listed !== undefined) plugins.set(id, listed);
    else if (inspection.files.manifest !== undefined) {
      plugins.set(id, id);
      locations.set(id, location);
      licenses.set(id, manifestLicense(inspection.files.manifest, undefined));
    }
  }
  for (const candidate of found) {
    const container = candidate.location === undefined ? undefined : plugins.get(repositoryId(candidate.location));
    if (candidate.kind !== 'marketplace' && container !== undefined) candidate.container = container;
  }
  return found;
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
    kind === 'skill' || kind === 'agent' || kind === 'output-style'
      ? fill(ranked(candidates, kind, facts), limit, fileReader(reading, kind))
      : // A refill reads only manifests not read before, each once, so it needs no bound.
        fill(ranked(candidates, kind, facts), limit, listedReader(reading), Number.POSITIVE_INFINITY);
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
  const containers = listedContainers(listed);
  const reading: Reading = { client, refuse, build: recordBuilder(runDate, refuse, containers), containers };
  const found: Candidate[] = [];
  const [plugins, topics] = await Promise.all([
    fill(ranked(listed, 'plugin', facts), perKind, pluginReader(reading, found)),
    topicItems(reading, topicPlaces(topicRepositories, facts)),
  ]);
  const all = mergeCandidates([...results.flatMap((result) => result.candidates), ...found, ...topics]);
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
