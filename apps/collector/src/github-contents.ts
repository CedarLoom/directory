import type { HttpClient } from './http-client.ts';

export interface Repository {
  owner: string;
  repo: string;
}

/** Headers of every GitHub API request; without a token the requests go unauthenticated (60 per hour). */
export function gitHubHeaders(token: string | undefined): Record<string, string> {
  return {
    'user-agent': 'cedarloom-directory-collector',
    'x-github-api-version': '2026-03-10',
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  };
}

/** Reads one file of the default branch into memory; the raw media type also serves files over 1 MB. */
export function readRepositoryFile(
  client: HttpClient,
  { owner, repo }: Repository,
  path: string,
  maxBytes: number,
): Promise<string> {
  return client.getText(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    accept: 'application/vnd.github.raw+json',
    maxBytes,
  });
}
