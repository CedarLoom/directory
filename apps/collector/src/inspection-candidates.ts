import { itemName, marketplaceFile, type SourceId } from '@directory/contracts';
import { ZodError } from 'zod';
import type { Candidate } from './candidate.ts';
import { type GitHubLocation, joinPath, locationId, locationLink, repositoryId } from './github-location.ts';
import { analyzeHooks } from './hook-analyzer.ts';
import { jsonText } from './json-text.ts';
import { entrySources } from './marketplace-analyzer.ts';
import { type DirectoryKey, directoryPaths, type Inspection } from './repository-tree.ts';

/** The place an inspection read: a listed plugin, whose skills and agents it contains, or a topic repository. */
export interface InspectedPlace {
  location: GitHubLocation;
  container?: string;
  provenance: SourceId[];
}

type Refuse = (id: string, error: ZodError) => void;

export type FileKind = 'skill' | 'agent' | 'output-style';

function itemCandidate(place: InspectedPlace, kind: FileKind, path: string, name: string): Candidate {
  const location = { ...place.location, path };
  // An agent or output style is one file; its id leaves out the .md extension.
  const idLocation = kind === 'skill' ? location : { ...location, path: path.slice(0, -'.md'.length) };
  return {
    kind,
    id: locationId(idLocation),
    name: itemName.parse(name),
    links: { source: locationLink(location) },
    location,
    ...(place.container === undefined ? {} : { container: place.container }),
    listedIn: [],
    provenance: place.provenance,
  };
}

const skillFolders: readonly DirectoryKey[] = ['skills', 'claudeSkills'];
const agentFolders: readonly DirectoryKey[] = ['agents', 'claudeAgents'];
const outputStyleFolders: readonly DirectoryKey[] = ['outputStyles', 'claudeOutputStyles'];

interface ItemPath {
  kind: FileKind;
  path: string;
  name: string;
}

function folderEntries(place: InspectedPlace, { directories }: Inspection, keys: readonly DirectoryKey[]) {
  return keys.flatMap((key) =>
    (directories[key] ?? []).map(({ name, type }) => ({
      name,
      type,
      path: joinPath(place.location.path, directoryPaths[key], name),
    })),
  );
}

/** The Markdown files of the folders as items of one kind, named by their file stem. */
function markdownFiles(place: InspectedPlace, inspection: Inspection, keys: readonly DirectoryKey[], kind: FileKind) {
  return folderEntries(place, inspection, keys)
    .filter((entry) => entry.type === 'blob' && entry.name.endsWith('.md'))
    .map(({ path, name }) => ({ kind, path, name: name.slice(0, -'.md'.length) }));
}

/** Each skill folder, agent file and output style file the place holds, as paths and names; the files are read later. */
function itemPaths(place: InspectedPlace, inspection: Inspection): ItemPath[] {
  const skills = folderEntries(place, inspection, skillFolders)
    .filter((entry) => entry.type === 'tree')
    .map(({ path, name }) => ({ kind: 'skill' as const, path, name }));
  const agents = markdownFiles(place, inspection, agentFolders, 'agent');
  const outputStyles = markdownFiles(place, inspection, outputStyleFolders, 'output-style');
  // A repository that is one skill holds SKILL.md at its root; a marketplace repository keeps its id for the marketplace.
  const rootSkill =
    place.container === undefined &&
    inspection.files.marketplace === undefined &&
    inspection.directories.root?.some((entry) => entry.name === 'SKILL.md' && entry.type === 'blob') === true;
  return [
    ...skills,
    ...agents,
    ...outputStyles,
    ...(rootSkill ? [{ kind: 'skill' as const, path: place.location.path, name: place.location.repo }] : []),
  ];
}

function marketplaceCandidate(place: InspectedPlace, text: string): Candidate {
  const file = jsonText.pipe(marketplaceFile).parse(text);
  return {
    kind: 'marketplace',
    id: repositoryId(place.location),
    name: file.name,
    links: { source: locationLink(place.location) },
    location: place.location,
    listedIn: [],
    provenance: place.provenance,
    entries: entrySources(file.plugins),
  };
}

/** The hooks file of the place as one item, named after the plugin folder or repository that holds it. */
function hookCandidate(place: InspectedPlace, id: string, text: string): Candidate | undefined {
  const hooks = analyzeHooks(text);
  if (hooks === undefined) return undefined;
  const { location } = place;
  return {
    kind: 'hook',
    id,
    name: itemName.parse(location.path.split('/').at(-1) || location.repo),
    links: { source: locationLink({ ...location, path: joinPath(location.path, 'hooks/hooks.json') }) },
    location,
    ...(place.container === undefined ? {} : { container: place.container }),
    listedIn: [],
    provenance: place.provenance,
    hooks,
  };
}

function attempt<T>(id: string, refuse: Refuse, build: () => T | undefined): T[] {
  try {
    const built = build();
    return built === undefined ? [] : [built];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    refuse(id, error);
    return [];
  }
}

/** The hooks file as an item, refused under its id, or under its repository when the id does not fit one. */
function hookCandidates(place: InspectedPlace, text: string, refuse: Refuse): Candidate[] {
  const { location } = place;
  const [id] = attempt(`${repositoryId(location)} hook`, refuse, () =>
    locationId({ ...location, path: joinPath(location.path, 'hooks') }),
  );
  return id === undefined ? [] : attempt(id, refuse, () => hookCandidate(place, id, text));
}

/** The skills, agents, output styles, hooks file and, at a topic repository's root, the marketplace an inspection found. */
export function inspectionCandidates(place: InspectedPlace, inspection: Inspection, refuse: Refuse): Candidate[] {
  const { marketplace, hooks } = inspection.files;
  const items = [
    ...itemPaths(place, inspection).flatMap(({ kind, path, name }) =>
      attempt(`${repositoryId(place.location)} ${kind}`, refuse, () => itemCandidate(place, kind, path, name)),
    ),
    ...(hooks === undefined ? [] : hookCandidates(place, hooks, refuse)),
  ];
  if (marketplace === undefined || place.container !== undefined) return items;
  return [...attempt(repositoryId(place.location), refuse, () => marketplaceCandidate(place, marketplace)), ...items];
}
