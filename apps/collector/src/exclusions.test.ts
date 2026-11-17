import { expect, it } from 'vitest';
import type { Candidate } from './candidate.ts';
import { applyExclusions, parseExclusions } from './exclusions.ts';

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
  const excluded = parseExclusions(
    JSON.stringify({ schemaVersion: 1, ids: ['gh.example-org.lint', 'gh.example-org.format.skills.fix'] }),
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
  const excluded = parseExclusions(JSON.stringify({ schemaVersion: 1, ids: ['gh.acme.market'] }));
  expect(applyExclusions(candidates, excluded).map(({ id }) => id)).toEqual(['gh.acme.tools']);
});

it('refuses an exclusions file with a value that is not an item id', () =>
  expect(() => parseExclusions(JSON.stringify({ schemaVersion: 1, ids: ['Example Org lint'] }))).toThrow(/ids/));
