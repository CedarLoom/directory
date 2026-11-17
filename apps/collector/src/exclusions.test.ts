import { expect, it } from 'vitest';
import type { Candidate } from './candidate.ts';
import { applyExclusions, parseExclusions } from './exclusions.ts';

const key = 'test-key-for-the-exclusion-hashes-only';
// The keyed hash of the text `exclusions`.
const keyCheck = '6dff3e273c8ce957d236e4400efe3ce0cc9cd9b4fe5ee08f2c9c59c950407f63';
const exclusionsText = (...hashes: string[]) => JSON.stringify({ schemaVersion: 2, keyCheck, hashes });

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
      '4fb16c1b2387b692ab7bebd3a47d064be2650b071892da87ebd36b423bbf6537',
      '8055e76a70b4de542a0752875bd3b34c4025d32464841b400327c85f0350a668',
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
    exclusionsText('46659e715f4762d840a82ccbd601b7f7abf95818cdb3c0d27bd6b9d5dad974c3'),
    key,
  );
  expect(applyExclusions(candidates, excluded).map(({ id }) => id)).toEqual(['gh.acme.tools']);
});

it('refuses an exclusions file that names an id instead of its hash', () =>
  expect(() => parseExclusions(exclusionsText('gh.example-org.lint'), key)).toThrow(/hashes/));

it('refuses exclusions without a key', () =>
  expect(() =>
    parseExclusions(exclusionsText('46659e715f4762d840a82ccbd601b7f7abf95818cdb3c0d27bd6b9d5dad974c3'), ''),
  ).toThrow(/EXCLUSIONS_KEY/));

it('refuses exclusions under another key', () =>
  expect(() =>
    parseExclusions(
      exclusionsText('46659e715f4762d840a82ccbd601b7f7abf95818cdb3c0d27bd6b9d5dad974c3'),
      'another-key-of-more-than-thirty-two-bytes',
    ),
  ).toThrow(/does not match/));

it('refuses a key shorter than 32 bytes', () =>
  expect(() =>
    parseExclusions(exclusionsText('46659e715f4762d840a82ccbd601b7f7abf95818cdb3c0d27bd6b9d5dad974c3'), 'short-key'),
  ).toThrow(/at least 32 bytes/));

it('refuses exclusions without a keyCheck', () => {
  const text = JSON.stringify({
    schemaVersion: 2,
    hashes: ['46659e715f4762d840a82ccbd601b7f7abf95818cdb3c0d27bd6b9d5dad974c3'],
  });
  expect(() => parseExclusions(text, key)).toThrow(/no keyCheck/);
});

it('reads an exclusions file without entries without a key', () =>
  expect(parseExclusions(exclusionsText(), '').has('gh.acme.market')).toBe(false));
