import { expect, it } from 'vitest';
import { pluginAssessment } from './item-signals.ts';

const nameValid = (name: string) =>
  pluginAssessment({
    name,
    manifestFields: 5,
    rootClaudeMd: false,
    components: { skills: 0, agents: 0, commands: 0, mcpServersByTransport: {}, binFiles: 0 },
    hasEvals: false,
    hooks: [],
    mcpUnpinnedPackage: false,
    mcpSecretsRequired: false,
    source: { kind: 'github', pin: 'sha' },
    listedIn: [],
  }).signals['nameValid'];

it('accepts a kebab-case plugin name that starts with claude, as official plugins do', () =>
  expect(['claude-code-setup', 'Lint'].map(nameValid)).toEqual([true, false]));
