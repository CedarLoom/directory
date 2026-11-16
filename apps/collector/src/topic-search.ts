import { z } from 'zod';
import type { Repository } from './github-contents.ts';
import type { HttpClient } from './http-client.ts';

const name = z.string().regex(/^[A-Za-z0-9_.-]+$/);
const searchAnswer = z.object({
  items: z.array(z.object({ name, owner: z.object({ login: name }) })),
});

/** The topics whose repositories the collector inspects for marketplaces, skills, agents, hooks and output styles. */
export const topics = [
  'claude-code-marketplace',
  'claude-code-plugin',
  'claude-code-plugins',
  'claude-skills',
  'agent-skills',
  'claude-code-skills',
  'claude-code-subagents',
  'claude-code-hooks',
] as const;

/** The most starred repositories of each topic, one search page each; a repository two topics share comes once. */
export async function searchTopics(
  client: HttpClient,
  searched: readonly string[],
  perTopic: number,
): Promise<Repository[]> {
  const pages = await Promise.all(
    searched.map(async (topic) => {
      const url = `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&order=desc&per_page=${perTopic}`;
      const text = await client.getText(url, { accept: 'application/vnd.github+json', maxBytes: 4 * 1024 * 1024 });
      return searchAnswer.parse(JSON.parse(text)).items;
    }),
  );
  const repositories = new Map(
    pages.flat().map(({ name: repo, owner }) => [`${owner.login}/${repo}`.toLowerCase(), { owner: owner.login, repo }]),
  );
  return [...repositories.values()];
}
