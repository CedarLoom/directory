import { expect, it } from 'vitest';
import type { HookFacts } from './hook-analyzer.ts';
import { type PluginFacts, hookAssessment, pluginAssessment, skillAssessment } from './item-signals.ts';

const emptyPlugin: PluginFacts = {
  name: 'lint',
  manifestFields: 5,
  rootClaudeMd: false,
  components: {
    skills: 0,
    agents: 0,
    commands: 0,
    hooksByEvent: {},
    mcpServersByTransport: {},
    lspServers: 0,
    outputStyles: 0,
    monitors: 0,
    binFiles: 0,
  },
  modules: 0,
  themesOrWorkflows: false,
  workflowCode: false,
  hasEvals: false,
  hooks: [],
  mcpUnpinnedPackage: false,
  mcpSecretsRequired: false,
  mcpHeadersHelper: false,
  source: { kind: 'github', pin: 'sha' },
  listedIn: [],
};

const nameValid = (name: string) => pluginAssessment({ ...emptyPlugin, name }).signals['nameValid'];

it('accepts a kebab-case plugin name that starts with claude, as official plugins do', () =>
  expect(['claude-code-setup', 'Lint'].map(nameValid)).toEqual([true, false]));

it('flags monitors, LSP servers, mod modules, workflow code and an MCP headers helper', () => {
  const { signals, flags } = pluginAssessment({
    ...emptyPlugin,
    components: {
      ...emptyPlugin.components,
      skills: 1,
      hooksByEvent: { PreToolUse: 2 },
      mcpServersByTransport: { stdio: 1, http: 1 },
      lspServers: 1,
      monitors: 2,
    },
    modules: 1,
    workflowCode: true,
    mcpHeadersHelper: true,
  });
  expect([signals['hasComponents'], flags]).toEqual([
    true,
    [
      'monitor-background-command',
      'lsp-server-command',
      'mod-module',
      'workflow-code',
      'mcp-remote',
      'mcp-headers-helper',
    ],
  ]);
});

it('flags a hooks file that lists mod modules', () => {
  const hooks: HookFacts = {
    events: ['Stop'],
    handlerTypes: ['prompt'],
    commandForms: [],
    matcherBreadth: 'none',
    networkIndicator: false,
  };
  expect([hookAssessment({ ...hooks, modules: 0 }).flags, hookAssessment({ ...hooks, modules: 1 }).flags]).toEqual([
    [],
    ['mod-module'],
  ]);
});

it.each([
  [{}, false],
  [{ themesOrWorkflows: true }, true],
  [{ components: { ...emptyPlugin.components, binFiles: 1 } }, true],
])('tells a plugin with components from an empty one: %j', (facts, hasComponents) =>
  expect(pluginAssessment({ ...emptyPlugin, ...facts }).signals['hasComponents']).toBe(hasComponents),
);

const licenseField = (declaredLicense: string | undefined) =>
  skillAssessment(
    {
      declaredName: 'lint',
      descriptionLength: 40,
      bodyLines: 10,
      tokens: { metadata: 30, body: 100 },
      unrestrictedBash: false,
      declaredLicense,
      scripts: 0,
      tests: false,
    },
    'lint',
  ).signals['licenseField'];

it('counts a license field only when it is neither blank, NOASSERTION nor withheld', () =>
  expect(
    [
      'MIT',
      'See LICENSE.txt',
      'UNLICENSED',
      'Proprietary',
      'Proprietary, all rights reserved',
      'NOASSERTION',
      ' ',
      undefined,
    ].map(licenseField),
  ).toEqual([true, true, false, false, true, false, false, false]));
