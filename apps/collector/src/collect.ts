import { ZodError } from 'zod';
import { type Candidate, type Located, mergeCandidates } from './candidate.ts';
import { type DataFiles, dataFiles } from './data-files.ts';
import { applyExclusions } from './exclusions.ts';
import type { Repository } from './github-contents.ts';
import { repositoryId } from './github-location.ts';
import type { HttpClient } from './http-client.ts';
import { type InspectedPlace, inspectionCandidates } from './inspection-candidates.ts';
import { issueSummary } from './issue-summary.ts';
import { type ItemFile, readItemFiles } from './item-files.ts';
import { UnknownLicenseError } from './license-class.ts';
import { buildRecord, type ItemKind, type ItemRecord, type RecordInput } from './records.ts';
import { type RepositoryFacts, readFacts } from './repository-facts.ts';
import { type Inspection, inspectLocations } from './repository-tree.ts';
import type { SourceAdapter } from './source-adapter.ts';
import { searchTopics } from './topic-search.ts';

/** The run report the `collect` command prints as JSON. */
export interface RunReport {
  format: 'directory-run-report';
  schemaVersion: 2;
  requests: number;
  refused: number;
  excluded: number;
  /** Candidates the sources and inspections named, after exclusions. */
  discovered: Record<ItemKind, number>;
  /** Records built. */
  items: Record<ItemKind, number>;
}

export interface CollectOptions {
  adapters: readonly SourceAdapter[];
  topics: readonly string[];
  excluded: ReadonlySet<string>;
  /** The data files of the last run, so unchanged files keep their bytes. */
  previous: DataFiles;
  runDate: string;
  log: (line: string) => void;
}

// Records per kind and run, most starred repositories first; it keeps a run near 100 requests.
const perKind = 60;
const perTopic = 30;
const kinds: readonly ItemKind[] = ['marketplace', 'plugin', 'skill', 'agent'];

function isLocated(candidate: Candidate): candidate is Located {
  return candidate.location !== undefined;
}

function uniqueRepositories(repositories: readonly Repository[]): Repository[] {
  return [...new Map(repositories.map((repository) => [repositoryId(repository), repository])).values()];
}

/** The candidates of one kind whose repository GitHub found, most stars first, then by id. */
function top(
  candidates: readonly Located[],
  kind: ItemKind,
  facts: ReadonlyMap<string, RepositoryFacts>,
  limit: number,
) {
  const stars = (candidate: Located) => facts.get(repositoryId(candidate.location))?.stars ?? -1;
  return candidates
    .filter((candidate) => candidate.kind === kind && stars(candidate) >= 0)
    .toSorted((first, second) => stars(second) - stars(first) || (first.id < second.id ? -1 : 1))
    .slice(0, limit);
}

function countByKind(items: readonly { kind: ItemKind }[]): Record<ItemKind, number> {
  const count = (kind: ItemKind) => items.filter((item) => item.kind === kind).length;
  return { marketplace: count('marketplace'), plugin: count('plugin'), skill: count('skill'), agent: count('agent') };
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

/** Inspects the most starred listed plugins and the topic repositories and adds the items they hold. */
async function inspectPlaces(client: HttpClient, places: readonly InspectedPlace[], refuse: Refuse) {
  const inspections = await inspectLocations(
    client,
    places.map((place) => place.location),
  );
  const inspected = new Map<string, Inspection>();
  const found: Candidate[] = [];
  for (const [index, place] of places.entries()) {
    const inspection = inspections[index];
    if (inspection === undefined) continue;
    if (inspection === 'too-large') {
      refuse(place.container ?? repositoryId(place.location), new Error(tooLarge));
      continue;
    }
    if (place.container !== undefined) inspected.set(place.container, inspection);
    found.push(...inspectionCandidates(place, inspection, refuse));
  }
  return { inspected, found };
}

/** Refuses each item whose file is too large; it gets no record. */
function refuseTooLarge(items: readonly Located[], files: readonly ItemFile[], refuse: Refuse): void {
  for (const [index, item] of items.entries())
    if (files[index]?.file === 'too-large') refuse(item.id, new Error(tooLarge));
}

function textOf(item: ItemFile | undefined): string | undefined {
  return item === undefined || item.file === 'too-large' ? undefined : item.file.text;
}

async function readFiles(client: HttpClient, skills: readonly Located[], agents: readonly Located[]) {
  return Promise.all([
    readItemFiles(
      client,
      skills.map(({ location }) => ({ location, file: 'SKILL.md' })),
      true,
    ),
    readItemFiles(
      client,
      agents.map(({ location }) => ({ location, file: '' })),
      false,
    ),
  ]);
}

function buildAll(inputs: readonly RecordInput[], runDate: string, refuse: Refuse) {
  return inputs.flatMap((input): ItemRecord[] => {
    try {
      return [buildRecord(input, runDate)];
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof UnknownLicenseError)) throw error;
      refuse(input.candidate.id, error);
      return [];
    }
  });
}

interface Selection {
  candidates: readonly Located[];
  facts: ReadonlyMap<string, RepositoryFacts>;
  plugins: readonly Located[];
  inspected: ReadonlyMap<string, Inspection>;
  skills: readonly Located[];
  skillFiles: readonly ItemFile[];
  agents: readonly Located[];
  agentFiles: readonly ItemFile[];
}

type FactsOf = (candidate: Located) => RepositoryFacts | undefined;

function marketplaceInputs(candidates: readonly Located[], factsOf: FactsOf): RecordInput[] {
  return candidates.flatMap((candidate): RecordInput[] => {
    const facts = factsOf(candidate);
    return candidate.kind === 'marketplace' && candidate.entries !== undefined && facts !== undefined
      ? [{ kind: 'marketplace', candidate, facts, entries: candidate.entries }]
      : [];
  });
}

function pluginInputs(selection: Selection, factsOf: FactsOf): RecordInput[] {
  return selection.plugins.flatMap((candidate): RecordInput[] => {
    const [facts, inspection, source] = [factsOf(candidate), selection.inspected.get(candidate.id), candidate.source];
    return facts !== undefined && inspection !== undefined && source !== undefined
      ? [{ kind: 'plugin', candidate, facts, inspection, source }]
      : [];
  });
}

function skillInputs(selection: Selection, factsOf: FactsOf): RecordInput[] {
  return selection.skills.flatMap((candidate, index): RecordInput[] => {
    const [facts, file] = [factsOf(candidate), selection.skillFiles[index]];
    const text = textOf(file);
    return facts !== undefined && file !== undefined && text !== undefined
      ? [{ kind: 'skill', candidate, facts, text, folders: file.folders }]
      : [];
  });
}

function agentInputs(selection: Selection, factsOf: FactsOf): RecordInput[] {
  return selection.agents.flatMap((candidate, index): RecordInput[] => {
    const [facts, text] = [factsOf(candidate), textOf(selection.agentFiles[index])];
    return facts !== undefined && text !== undefined ? [{ kind: 'agent', candidate, facts, text }] : [];
  });
}

/** Pairs each selected item with its repository facts and what was read for it; an item without them gets no record. */
function recordInputs(selection: Selection): RecordInput[] {
  const factsOf: FactsOf = (candidate) => selection.facts.get(repositoryId(candidate.location));
  return [
    ...marketplaceInputs(selection.candidates, factsOf),
    ...pluginInputs(selection, factsOf),
    ...skillInputs(selection, factsOf),
    ...agentInputs(selection, factsOf),
  ];
}

/** The listed plugins to inspect, with the skills and agents they contain, and each topic repository GitHub found. */
function placesToInspect(
  plugins: readonly Located[],
  topicRepositories: readonly Repository[],
  facts: ReadonlyMap<string, RepositoryFacts>,
) {
  return [
    ...plugins.map(({ location, id, provenance }): InspectedPlace => ({ location, container: id, provenance })),
    ...topicRepositories
      .filter((repository) => facts.has(repositoryId(repository)))
      .map(
        (repository): InspectedPlace => ({
          location: { ...repository, path: '', ref: 'HEAD' },
          provenance: ['github'],
        }),
      ),
  ];
}

/** Reads every source, inspects the selected items on GitHub and returns the run report and the data files. */
export async function collect(
  client: HttpClient,
  options: CollectOptions,
): Promise<{ report: RunReport; files: Map<string, string> }> {
  const { log, runDate, excluded } = options;
  const counter = { refused: 0 };
  const refuse = refusalLogger(log, counter);
  const results = await Promise.all(options.adapters.map((adapter) => adapter.collect(client, log)));
  counter.refused += results.reduce((sum, result) => sum + result.refused, 0);
  const listed = applyExclusions(mergeCandidates(results.flatMap((result) => result.candidates)), excluded).filter(
    isLocated,
  );
  // An excluded repository found by topic is not inspected, so the items it holds stay out too.
  const topicRepositories = identified(await searchTopics(client, options.topics, perTopic), refuse).filter(
    (repository) => !excluded.has(repositoryId(repository)),
  );
  const repositories = uniqueRepositories([...listed.map(({ location }) => location), ...topicRepositories]);
  const facts = await readFacts(client, repositories, runDate);
  const plugins = top(listed, 'plugin', facts, perKind);
  const { inspected, found } = await inspectPlaces(client, placesToInspect(plugins, topicRepositories, facts), refuse);
  const all = mergeCandidates([...results.flatMap((result) => result.candidates), ...found]);
  const kept = applyExclusions(all, excluded);
  const candidates = kept.filter(isLocated);
  const [skills, agents] = [top(candidates, 'skill', facts, perKind), top(candidates, 'agent', facts, perKind)];
  const [skillFiles, agentFiles] = await readFiles(client, skills, agents);
  refuseTooLarge(skills, skillFiles, refuse);
  refuseTooLarge(agents, agentFiles, refuse);
  const selection = { candidates, facts, plugins, inspected, skills, skillFiles, agents, agentFiles };
  const records = buildAll(recordInputs(selection), runDate, refuse);
  const report: RunReport = {
    format: 'directory-run-report',
    schemaVersion: 2,
    requests: client.requests,
    refused: counter.refused,
    excluded: all.length - kept.length,
    discovered: countByKind(kept),
    items: countByKind(records),
  };
  return { report, files: dataFiles(records, facts, options.previous, runDate) };
}

export function summaryLine({ items, discovered, excluded, refused, requests }: RunReport): string {
  const counts = kinds.map((kind) => `${items[kind]} of ${discovered[kind]} ${kind}`).join(', ');
  return `collect: ${counts} items; ${excluded} excluded, ${refused} refused; ${requests} requests`;
}
