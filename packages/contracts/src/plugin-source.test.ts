import { expect, it } from 'vitest';
import marketplace from '../fixtures/marketplace.json' with { type: 'json' };
import { classifySource } from './plugin-source.ts';

it('gives each entry of the fixture marketplace its source kind and pin', () =>
  expect(Object.fromEntries(marketplace.plugins.map(({ name, source }) => [name, classifySource(source)]))).toEqual({
    'relative-path': { kind: 'path', pin: 'marketplace-commit' },
    'bare-name': { kind: 'path', pin: 'marketplace-commit' },
    'github-sha': { kind: 'github', pin: 'sha' },
    'github-ref': { kind: 'github', pin: 'ref' },
    'github-unpinned': { kind: 'github', pin: 'none' },
    'url-sha': { kind: 'url', pin: 'sha' },
    'url-unpinned': { kind: 'url', pin: 'none' },
    'git-subdir-sha-and-ref': { kind: 'git-subdir', pin: 'sha' },
    'git-subdir-ref': { kind: 'git-subdir', pin: 'ref' },
    'npm-exact': { kind: 'npm', pin: 'version' },
    'npm-range': { kind: 'npm', pin: 'none' },
    'npm-tag': { kind: 'npm', pin: 'none' },
    'npm-unpinned': { kind: 'npm', pin: 'none' },
    archive: { kind: 'archive', pin: 'none' },
    command: { kind: 'command', pin: 'none' },
    'unknown-kind': { kind: 'other', pin: 'none' },
  }));

it('refuses a git source whose sha is not a full commit id', () =>
  expect(() => classifySource({ source: 'github', repo: 'example-org/lint', sha: 'a1b2c3d' })).toThrow(/sha/));

it('refuses an entry without a source kind', () =>
  expect(() => classifySource({ repo: 'example-org/lint' })).toThrow());
