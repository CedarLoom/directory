import { fileURLToPath } from 'node:url';
import { semver } from '@directory/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { readDataFolder } from './data-folder.ts';
import { readRubricFiles } from './rubric-files.ts';
import { runRefusals } from './validation.ts';

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

const indexRows = z.looseObject({ items: z.array(z.looseObject({})) });

/** The index without the items at the given positions. */
function indexWithout(positions: readonly number[]) {
  const index = indexRows.parse(JSON.parse(published.get('index.json') ?? ''));
  return {
    'index.json': JSON.stringify({
      ...index,
      items: index.items.filter((_, position) => !positions.includes(position)),
    }),
  };
}

// The first item of each kind in the fixture index: marketplace, plugin, skill, agent, hook, MCP server, output style.
const firstOfEachKind = [0, 3, 6, 10, 13, 16, 19];
const skillPath = 'records/skill/gh.example-org.skills.pdf-forms.json';

it('accepts a run that produced the published files', () =>
  expect(runRefusals({ candidate: candidate(), publishedIndex, rubrics, lock })).toEqual([]));

it('accepts a run in which 4 of 22 items of 4 kinds vanished', () =>
  expect(
    runRefusals({ candidate: candidate(indexWithout(firstOfEachKind.slice(0, 4))), publishedIndex, rubrics, lock }),
  ).toEqual([]));

it('refuses a run in which 7 of 22 items, about 30 percent, vanished', () =>
  expect(runRefusals({ candidate: candidate(indexWithout(firstOfEachKind)), publishedIndex, rubrics, lock })).toEqual([
    'index.json: 7 of 22 published items vanished, more than 20 percent',
  ]));

it('refuses a run in which every published MCP server vanished', () =>
  expect(runRefusals({ candidate: candidate(indexWithout([16, 17, 18])), publishedIndex, rubrics, lock })).toEqual([
    'index.json: all 3 published mcp-server items vanished',
  ]));

// The published index with a key its contract does not know, as one written under another contract version holds.
const otherContractIndex = JSON.stringify({
  ...indexRows.parse(JSON.parse(publishedIndex ?? '')),
  generator: 'collect',
});

it('reads only kind and id from the published index, so another contract still counts its items', () =>
  expect(runRefusals({ candidate: candidate(), publishedIndex: otherContractIndex, rubrics, lock })).toEqual([]));

it('refuses a candidate index against its contract with a refusal, not an error', () =>
  expect(
    runRefusals({ candidate: candidate({ 'index.json': otherContractIndex }), publishedIndex, rubrics, lock }),
  ).toEqual(['index.json: value unrecognized_keys']));

it('refuses a record at a path its kind and id do not name, and an index row without its record', () => {
  const files = candidate({ 'records/skill/gh.example-org.skills.pdf-form.json': published.get(skillPath) ?? '' });
  files.delete(skillPath);
  expect(runRefusals({ candidate: files, publishedIndex, rubrics, lock })).toEqual([
    'records/skill/gh.example-org.skills.pdf-form.json: its kind and id belong at records/skill/gh.example-org.skills.pdf-forms.json',
    'index.json: skill/gh.example-org.skills.pdf-forms has no record',
  ]);
});

it('refuses a file above its size cap', () => {
  const snapshots = Array.from({ length: 2000 }, (_, index) => ({ date: '2026-11-16', stars: index }));
  const path = 'popularity/gh.example-org.terse.json';
  const text = JSON.stringify({ schemaVersion: 1, id: 'gh.example-org.terse', snapshots }, null, 2);
  expect(runRefusals({ candidate: candidate({ [path]: text }), publishedIndex, rubrics, lock })).toEqual([
    'popularity/gh.example-org.terse.json: 120967 bytes, over the cap of 65536',
  ]);
});

it('refuses a run when a rubric file is not in the lock', () => {
  const hook = z.looseObject({ version: semver }).parse(rubrics['hook/1.0.0.json']);
  const unlocked = { ...hook, version: '1.1.0' };
  expect(
    runRefusals({ candidate: candidate(), publishedIndex, rubrics: { ...rubrics, 'hook/1.1.0.json': unlocked }, lock }),
  ).toEqual(['rubrics/hook/1.1.0.json is not in the lock']);
});

it('refuses meta.json in a run and a record with a free-text field', () =>
  expect(
    runRefusals({
      candidate: candidate({
        'meta.json': published.get('meta.json') ?? '',
        [skillPath]: JSON.stringify({ ...JSON.parse(published.get(skillPath) ?? ''), description: 'Fills forms.' }),
      }),
      publishedIndex,
      rubrics,
      lock,
    }),
  ).toEqual([
    'records/skill/gh.example-org.skills.pdf-forms.json: value unrecognized_keys',
    'meta.json: written by publish, never by a run',
  ]));
