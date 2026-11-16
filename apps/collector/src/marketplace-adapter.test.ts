import { expect, it } from 'vitest';
import { marketplaceAdapter } from './marketplace-adapter.ts';

/** Runs the adapter on one marketplace file of `example-org/market` and returns its result and log. */
async function read(plugins: unknown[]) {
  const file = JSON.stringify({ name: 'market', plugins });
  const client = { requests: 0, getText: async () => file };
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
