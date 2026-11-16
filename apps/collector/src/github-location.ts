import { gitSourceLocation, httpsUrl, itemId, relativePath, type SourceKind } from '@directory/contracts';
import type { Repository } from './github-contents.ts';

/** A directory of a GitHub repository at a commit, a ref or `HEAD`; `path` is '' for the root. */
export interface GitHubLocation extends Repository {
  path: string;
  ref: string;
}

const repositoryPattern = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Reads `owner/repo` from a GitHub URL or shorthand; a repository on another host gives undefined. */
function parseRepository(value: string): Repository | undefined {
  const [, owner, repo] = repositoryPattern.exec(value) ?? [];
  return owner === undefined || repo === undefined ? undefined : { owner, repo };
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

/** The item id `gh.<owner>.<repo>[.<path-slug>]`, lower case, one id segment per path segment. */
export function locationId({ owner, repo, path }: GitHubLocation): string {
  return itemId.parse(
    ['gh', owner, repo, ...path.split('/')]
      .filter((part) => part !== '')
      .join('.')
      .toLowerCase(),
  );
}
