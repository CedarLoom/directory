import { itemName, marketplaceFile, type SourceId } from '@directory/contracts';
import { ZodError } from 'zod';
import type { Candidate } from './candidate.ts';
import { type GitHubLocation, joinPath, locationId, locationLink, repositoryId } from './github-location.ts';
import { jsonText } from './json-text.ts';
import { entrySources } from './marketplace-analyzer.ts';
import type { DirectoryKey, Inspection } from './repository-tree.ts';

/** The place an inspection read: a listed plugin, whose skills and agents it contains, or a topic repository. */
export interface InspectedPlace {
  location: GitHubLocation;
  container?: string;
  provenance: SourceId[];
}

type Refuse = (id: string, error: ZodError) => void;

function itemCandidate(place: InspectedPlace, kind: 'skill' | 'agent', path: string, name: string): Candidate {
  const location = { ...place.location, path };
  // An agent is one file; its id leaves out the .md extension.
  const idLocation = kind === 'agent' ? { ...location, path: path.slice(0, -'.md'.length) } : location;
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
const folderPaths: Partial<Record<DirectoryKey, string>> = {
  skills: 'skills',
  claudeSkills: '.claude/skills',
  agents: 'agents',
  claudeAgents: '.claude/agents',
};

interface ItemPath {
  kind: 'skill' | 'agent';
  path: string;
  name: string;
}

function folderEntries(place: InspectedPlace, { directories }: Inspection, keys: readonly DirectoryKey[]) {
  return keys.flatMap((key) =>
    (directories[key] ?? []).map(({ name, type }) => ({
      name,
      type,
      path: joinPath(place.location.path, folderPaths[key] ?? '', name),
    })),
  );
}

/** Each skill folder and agent file the place holds, as paths and names; the files are read later. */
function itemPaths(place: InspectedPlace, inspection: Inspection): ItemPath[] {
  const skills = folderEntries(place, inspection, skillFolders)
    .filter((entry) => entry.type === 'tree')
    .map(({ path, name }) => ({ kind: 'skill' as const, path, name }));
  const agents = folderEntries(place, inspection, agentFolders)
    .filter((entry) => entry.type === 'blob' && entry.name.endsWith('.md'))
    .map(({ path, name }) => ({ kind: 'agent' as const, path, name: name.slice(0, -'.md'.length) }));
  // A repository that is one skill holds SKILL.md at its root; a marketplace repository keeps its id for the marketplace.
  const rootSkill =
    place.container === undefined &&
    inspection.files.marketplace === undefined &&
    inspection.directories.root?.some((entry) => entry.name === 'SKILL.md' && entry.type === 'blob') === true;
  return [
    ...skills,
    ...agents,
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

function attempt(id: string, refuse: Refuse, build: () => Candidate): Candidate[] {
  try {
    return [build()];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    refuse(id, error);
    return [];
  }
}

/** The skills, agents and, at a topic repository's root, the marketplace an inspection found. */
export function inspectionCandidates(place: InspectedPlace, inspection: Inspection, refuse: Refuse): Candidate[] {
  const marketplace = inspection.files.marketplace;
  const items = itemPaths(place, inspection).flatMap(({ kind, path, name }) =>
    attempt(`${repositoryId(place.location)} ${kind}`, refuse, () => itemCandidate(place, kind, path, name)),
  );
  if (marketplace === undefined || place.container !== undefined) return items;
  return [...attempt(repositoryId(place.location), refuse, () => marketplaceCandidate(place, marketplace)), ...items];
}
