import { expect, it } from 'vitest';
import { marketplaceAdapter } from './marketplace-adapter.ts';

/** Runs the adapter on one marketplace file of `example-org/market` and returns its result and log. */
async function read(plugins: unknown[]) {
  const file = JSON.stringify({ name: 'market', plugins });
  const client = { requests: 0, getText: async () => file, postText: async () => file };
  const lines: string[] = [];
  const adapter = marketplaceAdapter('community-marketplace', [{ owner: 'example-org', repo: 'market' }]);
  const result = await adapter.collect(client, (line) => lines.push(line));
  return { ...result, lines };
}

it('links a plugin only to the repository its id names', async () => {
  const result = await read([
    { name: 'spoof', source: { source: 'git-subdir', url: 'trusted/repo', path: 'p', ref: 'x/../../../../evil/repo' } },
    { name: 'dots', source: { source: 'github', repo: '../..' } },
  ]);
  expect(result).toEqual({
    refused: 1,
    lines: ['gh.example-org.market: refused plugins[0]: ref custom'],
    candidates: [
      {
        kind: 'marketplace',
        id: 'gh.example-org.market',
        name: 'market',
        links: { source: 'https://github.com/example-org/market' },
        listedIn: [],
        provenance: ['community-marketplace'],
        location: { owner: 'example-org', repo: 'market', path: '', ref: 'HEAD' },
        entries: {
          count: 2,
          sources: [
            { kind: 'git-subdir', pin: 'ref' },
            { kind: 'github', pin: 'none' },
          ],
        },
      },
      {
        kind: 'plugin',
        id: 'gh.example-org.market._.dots',
        name: 'dots',
        links: {},
        listedIn: ['gh.example-org.market'],
        provenance: ['community-marketplace'],
        source: { kind: 'github', pin: 'none' },
      },
    ],
  });
});

it('reads an entry of every source kind, an unknown kind included', async () => {
  const result = await read([
    { name: 'local', source: './local' },
    { name: 'gh', source: { source: 'github', repo: 'acme/gh', sha: 'b'.repeat(40) } },
    { name: 'git', source: { source: 'url', url: 'https://gitlab.example/acme/git.git', ref: 'main' } },
    { name: 'sub', source: { source: 'git-subdir', url: 'acme/mono', path: 'sub' } },
    { name: 'pkg', source: { source: 'npm', package: 'pkg', version: '2.0.0' } },
    { name: 'zip', source: { source: 'archive', url: 'https://example.test/zip.tar.gz' } },
    { name: 'cmd', source: { source: 'command', command: 'install-it' } },
    { name: 'new', source: { source: 'future-kind', id: 'x' } },
  ]);
  expect({ refused: result.refused, entries: result.candidates[0]?.entries }).toEqual({
    refused: 0,
    entries: {
      count: 8,
      sources: [
        { kind: 'path', pin: 'marketplace-commit' },
        { kind: 'github', pin: 'sha' },
        { kind: 'url', pin: 'ref' },
        { kind: 'git-subdir', pin: 'none' },
        { kind: 'npm', pin: 'version' },
        { kind: 'archive', pin: 'none' },
        { kind: 'command', pin: 'none' },
        { kind: 'other', pin: 'none' },
      ],
    },
  });
});

it('gives different ids to entries at different places', async () => {
  const result = await read([
    { name: 'plugins/lint', source: { source: 'npm', package: 'lint' } },
    { name: 'lint', source: './plugins/lint' },
    { name: 'kit-a', source: { source: 'github', repo: 'acme/tool.kit' } },
    { name: 'kit-b', source: { source: 'git-subdir', url: 'acme/tool', path: 'kit' } },
    { name: 'tool_kit', source: { source: 'github', repo: 'acme/tool_kit' } },
  ]);
  expect(result.candidates.map(({ name, id }) => [name, id])).toEqual([
    ['market', 'gh.example-org.market'],
    ['plugins/lint', 'gh.example-org.market._.plugins_2flint'],
    ['lint', 'gh.example-org.market.plugins.lint'],
    ['kit-a', 'gh.acme.tool_2ekit'],
    ['kit-b', 'gh.acme.tool.kit'],
    ['tool_kit', 'gh.acme.tool_5fkit'],
  ]);
});
