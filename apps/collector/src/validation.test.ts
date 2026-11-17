import { fileURLToPath } from 'node:url';
import { semver } from '@directory/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { readDataFolder } from './data-folder.ts';
import { readRubricFiles } from './rubric-files.ts';
import { checkRun, type RunFiles } from './validation.ts';

const folder = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// The site's fixture data: 22 items of every kind, each with its record, history and popularity file.
const published = await readDataFolder(folder('../../site/fixtures/data/v1'));
const publishedIndex = published.get('index.json');
const { rubrics, lock } = await readRubricFiles(folder('../../../rubrics'));

/** The published files as a run that changed nothing produces them, without meta.json, with `changes` applied. */
function candidate(changes: Record<string, string> = {}) {
  const files = new Map([...published].filter(([path]) => path !== 'meta.json'));
  for (const [path, text] of Object.entries(changes)) files.set(path, text);
  return files;
}

const indexRows = z.looseObject({ items: z.array(z.looseObject({ kind: z.string(), id: z.string() })) });
const fixtureIndex = indexRows.parse(JSON.parse(publishedIndex ?? ''));

/** The fixture items of each kind as the run report counts them. */
const fixtureCounts = { marketplace: 3, plugin: 3, skill: 4, agent: 3, hook: 3, 'mcp-server': 3, 'output-style': 3 };

/** The check of a run of these files, with the fixture counts in its report unless `reportedItems` is given. */
const check = (files: Partial<RunFiles> = {}) =>
  checkRun({
    candidate: candidate(),
    reportedItems: fixtureCounts,
    publishedIndex,
    allowRemovals: new Set(),
    rubrics,
    lock,
    ...files,
  });

const refusals = (files: Partial<RunFiles> = {}) => check(files).refused;

/** The index without the items at the given positions. */
function indexWithout(positions: readonly number[]) {
  return {
    'index.json': JSON.stringify({
      ...fixtureIndex,
      items: fixtureIndex.items.filter((_, position) => !positions.includes(position)),
    }),
  };
}

/** A run with this many copies of the first fixture skill and of the first fixture marketplace, each under its own id. */
function copies(skills: number, marketplaces: number) {
  const files = new Map<string, string>();
  const items = [...copiesOf(0, marketplaces, files), ...copiesOf(6, skills, files)];
  files.set('index.json', JSON.stringify({ ...fixtureIndex, items }));
  return files;
}

function copiesOf(position: number, count: number, files: Map<string, string>) {
  const row = fixtureIndex.items[position];
  if (row === undefined) throw new Error(`no fixture item at ${position}`);
  const record = z.looseObject({}).parse(JSON.parse(published.get(`records/${row.kind}/${row.id}.json`) ?? ''));
  return Array.from({ length: count }, (_, copy) => {
    const id = `${row.id}-${copy}`;
    files.set(`records/${row.kind}/${id}.json`, JSON.stringify({ ...record, id }));
    return { ...row, id };
  });
}

const skillPath = 'records/skill/gh.example-org.skills.pdf-forms.json';

it('accepts a run that produced the published files', () => expect(refusals()).toEqual([]));

const noMcpServers = {
  candidate: candidate(indexWithout([16, 17, 18])),
  reportedItems: { ...fixtureCounts, 'mcp-server': 0 },
};

it('refuses a run in which every published MCP server vanished', () =>
  expect(refusals(noMcpServers)).toEqual([
    'index.json: 3 of 3 published mcp-server items vanished, more than 20 percent',
  ]));

it('refuses the vanished items of a kind whose removals are not allowed', () =>
  expect(refusals({ ...noMcpServers, allowRemovals: new Set(['skill']) })).toEqual([
    'index.json: 3 of 3 published mcp-server items vanished, more than 20 percent',
  ]));

// 59 of 300 items vanished, under 20 percent of all of them.
const sixtyToOne = {
  candidate: copies(1, 240),
  reportedItems: {
    ...fixtureCounts,
    marketplace: 240,
    plugin: 0,
    skill: 1,
    agent: 0,
    hook: 0,
    'mcp-server': 0,
    'output-style': 0,
  },
  publishedIndex: copies(60, 240).get('index.json'),
};

it('refuses a run in which a kind fell from 60 items to 1', () =>
  expect(refusals(sixtyToOne)).toEqual(['index.json: 59 of 60 published skill items vanished, more than 20 percent']));

it('accepts a kind that fell from 60 items to 1 when its removals are allowed, and names the loss', () =>
  expect(check({ ...sixtyToOne, allowRemovals: new Set(['skill']) })).toEqual({
    refused: [],
    accepted: ['index.json: 59 of 60 published skill items vanished, more than 20 percent'],
  }));

it('refuses a run report whose item counts differ from the index', () =>
  expect(refusals({ reportedItems: { ...fixtureCounts, skill: 5, hook: 2 } })).toEqual([
    'index.json: 4 skill items, the run report counts 5',
    'index.json: 3 hook items, the run report counts 2',
  ]));

// The published index with a key its contract does not know, as one written under another contract version holds.
const otherContractIndex = JSON.stringify({ ...fixtureIndex, generator: 'collect' });

it('reads only kind and id from the published index, so another contract still counts its items', () =>
  expect(refusals({ publishedIndex: otherContractIndex })).toEqual([]));

it('refuses a candidate index against its contract with a refusal, not an error', () =>
  expect(refusals({ candidate: candidate({ 'index.json': otherContractIndex }) })).toEqual([
    'index.json: value unrecognized_keys',
  ]));

it('refuses a record at a path its kind and id do not name, and an index row without its record', () => {
  const files = candidate({ 'records/skill/gh.example-org.skills.pdf-form.json': published.get(skillPath) ?? '' });
  files.delete(skillPath);
  expect(refusals({ candidate: files })).toEqual([
    'records/skill/gh.example-org.skills.pdf-form.json: its kind and id belong at records/skill/gh.example-org.skills.pdf-forms.json',
    'index.json: skill/gh.example-org.skills.pdf-forms has no record',
  ]);
});

it('refuses a file above its size cap', () => {
  const snapshots = Array.from({ length: 2000 }, (_, index) => ({ date: '2026-11-16', stars: index }));
  const path = 'popularity/gh.example-org.terse.json';
  const text = JSON.stringify({ schemaVersion: 1, id: 'gh.example-org.terse', snapshots }, null, 2);
  expect(refusals({ candidate: candidate({ [path]: text }) })).toEqual([
    'popularity/gh.example-org.terse.json: 120967 bytes, over the cap of 65536',
  ]);
});

it('refuses a run when a rubric file is not in the lock', () => {
  const hook = z.looseObject({ version: semver }).parse(rubrics['hook/1.0.0.json']);
  const unlocked = { ...hook, version: '1.1.0' };
  expect(refusals({ rubrics: { ...rubrics, 'hook/1.1.0.json': unlocked } })).toEqual([
    'rubrics/hook/1.1.0.json is not in the lock',
  ]);
});

it('refuses meta.json in a run and a record with a free-text field', () =>
  expect(
    refusals({
      candidate: candidate({
        'meta.json': published.get('meta.json') ?? '',
        [skillPath]: JSON.stringify({ ...JSON.parse(published.get(skillPath) ?? ''), description: 'Fills forms.' }),
      }),
    }),
  ).toEqual([
    'records/skill/gh.example-org.skills.pdf-forms.json: value unrecognized_keys',
    'meta.json: written by publish, never by a run',
  ]));
