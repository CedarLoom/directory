/** The counts the header's repository link shows; each is absent when GitHub did not give it. */
export interface RepoFacts {
  stars?: number;
  forks?: number;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Stars and forks of a GitHub repository, read once per build so the browser makes no request to GitHub.
 * A failure (offline, rate limit, timeout) is logged and leaves the counts out: the build never fails on it.
 */
export async function repoFacts(repo: string, token: string, request: Fetch): Promise<RepoFacts> {
  try {
    const response = await request(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info: unknown = await response.json();
    const facts: RepoFacts = {};
    if (typeof info !== 'object' || info === null) return facts;
    if ('stargazers_count' in info && typeof info.stargazers_count === 'number') facts.stars = info.stargazers_count;
    if ('forks_count' in info && typeof info.forks_count === 'number') facts.forks = info.forks_count;
    return facts;
  } catch (error) {
    console.warn(`repo-facts: ${repo} without counts: ${String(error)}`);
    return {};
  }
}
