import { expect, it } from 'vitest';
import { publication } from './publication.ts';
import type { RunReport } from './run-report.ts';

const license = 'CC0 1.0 Universal';
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
const { removed } = publication(candidate, published, report, {
  excluded: new Set(['gh.acme.skills.dropped', 'gh.acme.tool']),
  license,
});

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
  expect(publication(candidate, files, report, { excluded: new Set(['gh.acme.tool']), license }).removed).toEqual([
    'records/skill/gh.acme.tool.lint.json',
    'history/skill/gh.acme.tool.lint.json',
    'popularity/gh.acme.tool.json',
  ]);
});

it('removes the history an item kept after it left the index once its repository is excluded', () => {
  const files = new Map([['history/skill/gh.acme.tool.lint.json', '{}']]);
  expect(publication(candidate, files, report, { excluded: new Set(['gh.acme.tool']), license }).removed).toEqual([
    'history/skill/gh.acme.tool.lint.json',
  ]);
});

it('keeps a file outside the data layout whose name is an excluded id', () => {
  const files = new Map([['notes/gh.acme.tool.json', '{}']]);
  expect(publication(candidate, files, report, { excluded: new Set(['gh.acme.tool']), license }).removed).toEqual([]);
});

const departuresText = (files: Record<string, string>) => JSON.stringify({ schemaVersion: 1, files });

it('dates the files kept for an item that left the index and forgets an item that returned', () => {
  const before = departuresText({ 'history/skill/gh.acme.skills.kept.json': '2026-11-01' });
  const { files } = publication(candidate, new Map([...published, ['departures.json', before]]), report, {
    excluded: new Set(),
    license,
  });
  expect(JSON.parse(files.get('departures.json') ?? '')).toEqual({
    schemaVersion: 1,
    files: {
      'history/agent/gh.acme.helper.json': '2026-11-23',
      'history/plugin/gh.acme.tool.json': '2026-11-23',
      'history/skill/gh.acme.skills.dropped.json': '2026-11-23',
      'popularity/gh.acme.helper.json': '2026-11-23',
      'popularity/gh.acme.tool.json': '2026-11-23',
    },
  });
});

it('removes the history and popularity file of an item 90 days after it left the index', () => {
  const files = new Map([
    ['history/agent/gh.acme.old.json', '{}'],
    ['popularity/gh.acme.old.json', '{}'],
    ['history/agent/gh.acme.recent.json', '{}'],
    [
      'departures.json',
      departuresText({
        'history/agent/gh.acme.old.json': '2026-08-25',
        'popularity/gh.acme.old.json': '2026-08-25',
        'history/agent/gh.acme.recent.json': '2026-08-26',
      }),
    ],
  ]);
  const { files: written, removed: expired } = publication(candidate, files, report, { excluded: new Set(), license });
  expect({ expired, departures: JSON.parse(written.get('departures.json') ?? '').files }).toEqual({
    expired: ['history/agent/gh.acme.old.json', 'popularity/gh.acme.old.json'],
    departures: { 'history/agent/gh.acme.recent.json': '2026-08-26' },
  });
});
