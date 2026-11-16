import { gitSourceLocation, httpsUrl, itemId, relativePath, type SourceKind } from '@directory/contracts';
import type { Repository } from './github-contents.ts';

/** A directory of a GitHub repository at a commit, a ref or `HEAD`; `path` is '' for the root. */
export interface GitHubLocation extends Repository {
  path: string;
  ref: string;
}

const repositoryPattern = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

const dotSegments: ReadonlySet<string> = new Set(['.', '..']);

/** Reads `owner/repo` from a GitHub URL or shorthand; a repository on another host, or a `.` or `..` name, gives undefined. */
function parseRepository(value: string): Repository | undefined {
  const [, owner, repo] = repositoryPattern.exec(value) ?? [];
  if (owner === undefined || repo === undefined || dotSegments.has(owner) || dotSegments.has(repo)) return undefined;
  return { owner, repo };
}

/** Joins relative paths into one without `./` and trailing slashes; '' is the root. */
export function joinPath(...paths: string[]): string {
  return paths
    .flatMap((path) => path.split('/'))
    .filter((part) => part !== '' && part !== '.')
    .join('/');
}

const gitKinds: ReadonlySet<SourceKind> = new Set(['github', 'url', 'git-subdir']);

function gitLocation(source: unknown): GitHubLocation | undefined {
  const { repo, url, path, ref, sha } = gitSourceLocation.parse(source);
  const repository = parseRepository(repo ?? url ?? '');
  return repository && { ...repository, path: joinPath(path ?? ''), ref: sha ?? ref ?? 'HEAD' };
}

/** Where a marketplace entry's source points on GitHub; undefined for npm, archive and command sources and other hosts. */
export function locateSource(
  source: unknown,
  kind: SourceKind,
  marketplace: GitHubLocation,
): GitHubLocation | undefined {
  if (kind === 'path') return { ...marketplace, path: joinPath(marketplace.path, relativePath.parse(source)) };
  return gitKinds.has(kind) ? gitLocation(source) : undefined;
}

export function locationLink({ owner, repo, path, ref }: GitHubLocation): string {
  const repository = `https://github.com/${owner}/${repo}`;
  return httpsUrl.parse(path === '' ? repository : `${repository}/tree/${ref}/${path}`);
}

/** Escapes `_`, `.` and `/` as `_5f`, `_2e` and `_2f`, so `.` only separates id segments and no segment is a bare `_`. */
function idSegment(part: string): string {
  return part.replaceAll(/[._/]/g, (character) => `_${character.charCodeAt(0).toString(16)}`);
}

function joinId(segments: readonly string[]): string {
  return itemId.parse(segments.join('.').toLowerCase());
}

function repositorySegments({ owner, repo }: Repository): string[] {
  return ['gh', idSegment(owner), idSegment(repo)];
}

/** The item id `gh.<owner>.<repo>[.<path-slug>]`, lower case, one id segment per path segment. */
export function locationId(location: GitHubLocation): string {
  const pathSegments = location.path.split('/').filter((part) => part !== '');
  return joinId([...repositorySegments(location), ...pathSegments.map(idSegment)]);
}

/** The id `gh.<owner>.<repo>._.<name>` of an entry identified by its marketplace and name; the `_` segment keeps it apart from every location id. */
export function entryNameId(marketplace: Repository, name: string): string {
  return joinId([...repositorySegments(marketplace), '_', idSegment(name)]);
}
