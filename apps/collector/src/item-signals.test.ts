import { expect, it } from 'vitest';
import { pluginAssessment } from './item-signals.ts';

const nameValid = (name: string) =>
  pluginAssessment({
    name,
    manifestFields: 5,
    rootClaudeMd: false,
    components: { skills: 0, agents: 0, commands: 0, hooksByEvent: {}, mcpServersByTransport: {}, binFiles: 0 },
    hasEvals: false,
    hooks: undefined,
    source: { kind: 'github', pin: 'sha' },
    listedIn: [],
  }).signals['nameValid'];

it('refuses the plugin names Claude Code reserves and accepts a reserved word elsewhere', () =>
  expect(
    ['claude-tools', 'anthropics', 'cc-plugin-lint', 'official-claude-kit', 'lint-for-claude', 'Lint'].map(nameValid),
  ).toEqual([false, false, false, false, true, false]));
