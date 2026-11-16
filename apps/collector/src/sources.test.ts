import { expect, it } from 'vitest';
import { createHttpClient } from './http-client.ts';
import { sourceAdapters } from './sources.ts';

const sha = 'a'.repeat(40);

/** Synthetic marketplace files by repository, served as the contents API serves raw files. */
const marketplaces: Record<string, unknown> = {
  'anthropics/claude-plugins-official': {
    name: 'claude-plugins-official',
    plugins: [
      { name: 'code-review', source: './plugins/code-review', homepage: 'https://example.com/code-review' },
      {
        name: 'lint',
        source: { source: 'github', repo: 'example-org/lint', sha },
        homepage: 'https://claude.com/lint',
      },
      { name: 'Bad Name', source: './plugins/bad' },
    ],
  },
  'anthropics/claude-plugins-community': {
    name: 'claude-plugins-community',
    plugins: [
      { name: 'lint', source: { source: 'url', url: 'https://github.com/example-org/lint.git' } },
      { name: 'deploy', source: { source: 'git-subdir', url: 'example-org/tools', path: 'plugins/deploy', ref: 'v1' } },
      { name: 'helper', source: { source: 'npm', package: '@example-org/helper', version: '1.2.3' } },
      { name: 'escape', source: '../outside' },
    ],
  },
  'anthropics/skills': {
    name: 'anthropic-agent-skills',
    plugins: [{ name: 'document-skills', source: './', skills: ['./skills/pdf', './skills/docx'] }],
  },
  'anthropics/knowledge-work-plugins': {
    name: 'knowledge-work-plugins',
    plugins: [{ name: 'sales', source: './sales' }],
  },
};

const contentsUrl = /^https:\/\/api\.github\.com\/repos\/(.+)\/contents\/\.claude-plugin\/marketplace\.json$/;

async function fetch(input: string | URL | Request): Promise<Response> {
  const [, repository] = contentsUrl.exec(new Request(input).url) ?? [];
  const file = repository === undefined ? undefined : marketplaces[repository];
  return file === undefined ? new Response(null, { status: 404 }) : new Response(JSON.stringify(file));
}

function client() {
  const clock = { now: () => 0, sleep: async () => undefined };
  return createHttpClient({
    fetch,
    clock,
    headers: {},
    cap: 10,
    intervalMs: 0,
    maxRetries: 0,
    maxDelayMs: 0,
    log: () => undefined,
  });
}

const official = 'gh.anthropics.claude-plugins-official';
const community = 'gh.anthropics.claude-plugins-community';

it('reads the official marketplace and refuses an entry with an invalid name', async () => {
  const [adapter] = sourceAdapters;
  expect(await adapter?.collect(client(), () => undefined)).toEqual({
    refused: 1,
    candidates: [
      {
        kind: 'marketplace',
        id: official,
        name: 'claude-plugins-official',
        links: { source: 'https://github.com/anthropics/claude-plugins-official' },
        listedIn: [],
        provenance: ['official-marketplace'],
        location: { owner: 'anthropics', repo: 'claude-plugins-official', path: '', ref: 'HEAD' },
        entries: {
          count: 3,
          sources: [
            { kind: 'path', pin: 'marketplace-commit' },
            { kind: 'github', pin: 'sha' },
          ],
        },
      },
      {
        kind: 'plugin',
        id: 'gh.anthropics.claude-plugins-official.plugins.code-review',
        name: 'code-review',
        links: { source: 'https://github.com/anthropics/claude-plugins-official/tree/HEAD/plugins/code-review' },
        listedIn: [official],
        provenance: ['official-marketplace'],
        location: { owner: 'anthropics', repo: 'claude-plugins-official', path: 'plugins/code-review', ref: 'HEAD' },
        source: { kind: 'path', pin: 'marketplace-commit' },
      },
      {
        kind: 'plugin',
        id: 'gh.example-org.lint',
        name: 'lint',
        links: { source: 'https://github.com/example-org/lint', homepage: 'https://claude.com/lint' },
        listedIn: [official],
        provenance: ['official-marketplace'],
        location: { owner: 'example-org', repo: 'lint', path: '', ref: sha },
        source: { kind: 'github', pin: 'sha' },
      },
    ],
  });
});

it('reads the community marketplace and refuses a path out of the repository', async () => {
  const [, adapter] = sourceAdapters;
  const result = await adapter?.collect(client(), () => undefined);
  expect(result?.refused).toBe(1);
  expect(result?.candidates.slice(1)).toEqual([
    {
      kind: 'plugin',
      id: 'gh.example-org.lint',
      name: 'lint',
      links: { source: 'https://github.com/example-org/lint' },
      listedIn: [community],
      provenance: ['community-marketplace'],
      location: { owner: 'example-org', repo: 'lint', path: '', ref: 'HEAD' },
      source: { kind: 'url', pin: 'none' },
    },
    {
      kind: 'plugin',
      id: 'gh.example-org.tools.plugins.deploy',
      name: 'deploy',
      links: { source: 'https://github.com/example-org/tools/tree/v1/plugins/deploy' },
      listedIn: [community],
      provenance: ['community-marketplace'],
      location: { owner: 'example-org', repo: 'tools', path: 'plugins/deploy', ref: 'v1' },
      source: { kind: 'git-subdir', pin: 'ref' },
    },
    {
      kind: 'plugin',
      id: 'gh.anthropics.claude-plugins-community._.helper',
      name: 'helper',
      links: {},
      listedIn: [community],
      provenance: ['community-marketplace'],
      source: { kind: 'npm', pin: 'version' },
    },
  ]);
});

it('reads both Anthropic topic marketplaces with the skills a plugin lists', async () => {
  const [, , adapter] = sourceAdapters;
  const result = await adapter?.collect(client(), () => undefined);
  expect(result?.refused).toBe(0);
  expect(result?.candidates.map(({ kind, id, links, container }) => ({ kind, id, links, container }))).toEqual([
    {
      kind: 'marketplace',
      id: 'gh.anthropics.skills',
      links: { source: 'https://github.com/anthropics/skills' },
      container: undefined,
    },
    {
      kind: 'plugin',
      id: 'gh.anthropics.skills._.document-skills',
      links: { source: 'https://github.com/anthropics/skills' },
      container: undefined,
    },
    {
      kind: 'skill',
      id: 'gh.anthropics.skills.skills.pdf',
      links: { source: 'https://github.com/anthropics/skills/tree/HEAD/skills/pdf' },
      container: 'gh.anthropics.skills._.document-skills',
    },
    {
      kind: 'skill',
      id: 'gh.anthropics.skills.skills.docx',
      links: { source: 'https://github.com/anthropics/skills/tree/HEAD/skills/docx' },
      container: 'gh.anthropics.skills._.document-skills',
    },
    {
      kind: 'marketplace',
      id: 'gh.anthropics.knowledge-work-plugins',
      links: { source: 'https://github.com/anthropics/knowledge-work-plugins' },
      container: undefined,
    },
    {
      kind: 'plugin',
      id: 'gh.anthropics.knowledge-work-plugins.sales',
      links: { source: 'https://github.com/anthropics/knowledge-work-plugins/tree/HEAD/sales' },
      container: undefined,
    },
  ]);
});
