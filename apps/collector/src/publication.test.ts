import { expect, it } from 'vitest';
import { publication } from './publication.ts';
import type { RunReport } from './run-report.ts';

const none = { marketplace: 0, plugin: 0, skill: 0, agent: 0, hook: 0, 'mcp-server': 0, 'output-style': 0 };
const report: RunReport = {
  format: 'directory-run-report',
  schemaVersion: 4,
  runAt: '2026-11-23T06:00:00Z',
  requests: 0,
  refused: 0,
  excluded: 0,
  discovered: { ...none, skill: 1 },
  items: { ...none, skill: 1 },
  sources: [],
};

/** The files of one item: its record, which points to the popularity file of its repository, and its history. */
function itemFiles(kind: string, id: string, repository: string): [string, string][] {
  const stars = { signal: 'stars', ref: repository, scope: 'repository', source: 'github' };
  return [
    [`records/${kind}/${id}.json`, JSON.stringify({ id, kind, provenance: ['github'], popularity: [stars] })],
    [`history/${kind}/${id}.json`, JSON.stringify({ id, kind, entries: [] })],
  ];
}

const popularity = (repository: string): [string, string] => [`popularity/${repository}.json`, '{}'];

// One skill stays; a skill of the same repository and a plugin are excluded; an agent left the index without exclusion.
const candidate = new Map([
  ...itemFiles('skill', 'gh.acme.skills.kept', 'gh.acme.skills'),
  popularity('gh.acme.skills'),
  ['index.json', '{}'],
]);
const published = new Map([
  ...candidate,
  ...itemFiles('skill', 'gh.acme.skills.dropped', 'gh.acme.skills'),
  ...itemFiles('plugin', 'gh.acme.tool', 'gh.acme.tool'),
  popularity('gh.acme.tool'),
  ...itemFiles('agent', 'gh.acme.helper', 'gh.acme.helper'),
  popularity('gh.acme.helper'),
]);
const { removed } = publication(candidate, published, report, new Set(['gh.acme.skills.dropped', 'gh.acme.tool']));

it('removes the record, history and popularity file of an excluded item', () =>
  expect(removed.filter((path) => path.includes('gh.acme.tool'))).toEqual([
    'records/plugin/gh.acme.tool.json',
    'history/plugin/gh.acme.tool.json',
    'popularity/gh.acme.tool.json',
  ]));

it('removes the record of an item that left the index and keeps its history and popularity file', () =>
  expect(removed.filter((path) => path.includes('gh.acme.helper'))).toEqual(['records/agent/gh.acme.helper.json']));

it('keeps the popularity file of an excluded item while an item that stays points to it', () =>
  expect(removed.filter((path) => path.includes('gh.acme.skills'))).toEqual([
    'records/skill/gh.acme.skills.dropped.json',
    'history/skill/gh.acme.skills.dropped.json',
  ]));

it('removes the history and popularity file of an item in an excluded repository', () => {
  const files = new Map([...itemFiles('skill', 'gh.acme.tool.lint', 'gh.acme.tool'), popularity('gh.acme.tool')]);
  expect(publication(candidate, files, report, new Set(['gh.acme.tool'])).removed).toEqual([
    'records/skill/gh.acme.tool.lint.json',
    'history/skill/gh.acme.tool.lint.json',
    'popularity/gh.acme.tool.json',
  ]);
});
