import { expect, it } from 'vitest';
import type { Candidate } from './candidate.ts';
import { applyExclusions, parseExclusions } from './exclusions.ts';

const key = 'test-key';
const exclusionsText = (...hashes: string[]) => JSON.stringify({ schemaVersion: 2, hashes });

function candidate(kind: Candidate['kind'], id: string, container?: string): Candidate {
  return {
    kind,
    id,
    name: id.split('.').at(-1) ?? id,
    links: {},
    ...(container === undefined ? {} : { container }),
    listedIn: ['gh.example-org.marketplace'],
    provenance: ['official-marketplace'],
  };
}

it('leaves out an excluded item and the items it contains', () => {
  const candidates = [
    candidate('plugin', 'gh.example-org.lint'),
    candidate('skill', 'gh.example-org.lint.skills.check', 'gh.example-org.lint'),
    candidate('plugin', 'gh.example-org.format'),
    candidate('skill', 'gh.example-org.format.skills.style', 'gh.example-org.format'),
    candidate('skill', 'gh.example-org.format.skills.fix', 'gh.example-org.format'),
  ];
  // The keyed hashes of gh.example-org.lint and gh.example-org.format.skills.fix.
  const excluded = parseExclusions(
    exclusionsText(
      'b0c07dfcc4a6d50513f8c7c25aac3c9eac019ac6f00cc0e1a6ccbe34f4de87b7',
      'c949fb0c8bc851f65eaf7d37ee6ac5fb640a607fe522c4c08b19bcfb017c6e0c',
    ),
    key,
  );
  expect(applyExclusions(candidates, excluded).map(({ id }) => id)).toEqual([
    'gh.example-org.format',
    'gh.example-org.format.skills.style',
  ]);
});

it('leaves out every item in an excluded repository', () => {
  const location = { owner: 'acme', repo: 'market', ref: 'HEAD' };
  const candidates = [
    { ...candidate('plugin', 'gh.acme.market.plugins.foo'), location: { ...location, path: 'plugins/foo' } },
    { ...candidate('plugin', 'gh.acme.tools'), location: { ...location, repo: 'tools', path: '' } },
  ];
  // The keyed hash of gh.acme.market.
  const excluded = parseExclusions(
    exclusionsText('14a15768010a45bdc53e0d4c520b14c095bca121d98a7543e6c7ae3e4fddb129'),
    key,
  );
  expect(applyExclusions(candidates, excluded).map(({ id }) => id)).toEqual(['gh.acme.tools']);
});

it('refuses an exclusions file that names an id instead of its hash', () =>
  expect(() => parseExclusions(exclusionsText('gh.example-org.lint'), key)).toThrow(/hashes/));

it('refuses exclusions without a key', () =>
  expect(() =>
    parseExclusions(exclusionsText('14a15768010a45bdc53e0d4c520b14c095bca121d98a7543e6c7ae3e4fddb129'), ''),
  ).toThrow(/EXCLUSIONS_KEY/));

it('reads an exclusions file without entries without a key', () =>
  expect(parseExclusions(exclusionsText(), '').has('gh.acme.market')).toBe(false));
