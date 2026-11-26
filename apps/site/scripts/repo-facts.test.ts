import { describe, expect, it, vi } from 'vitest';
import { repoFacts } from './repo-facts.ts';

describe('repoFacts', () => {
  it('reads stars and forks with the token', async () => {
    const seen: string[] = [];
    const facts = await repoFacts('o/r', 't0k', (url, init) => {
      seen.push(url, new Headers(init.headers).get('Authorization') ?? '');
      return Promise.resolve(Response.json({ stargazers_count: 12, forks_count: 3 }));
    });
    expect(facts).toEqual({ stars: 12, forks: 3 });
    expect(seen).toEqual(['https://api.github.com/repos/o/r', 'Bearer t0k']);
  });

  it('leaves the counts out when GitHub refuses or is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repoFacts('o/r', 't', () => Promise.resolve(Response.json({}, { status: 403 })))).toEqual({});
    expect(await repoFacts('o/r', 't', () => Promise.reject(new Error('offline')))).toEqual({});
  });
});
