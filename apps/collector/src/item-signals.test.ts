import { expect, it } from 'vitest';
import { pluginAssessment, skillAssessment } from './item-signals.ts';

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
