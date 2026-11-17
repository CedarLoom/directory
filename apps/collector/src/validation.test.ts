import { fileURLToPath } from 'node:url';
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

/** The index with the first `count` items left out. */
function indexWithout(count: number) {
  const index = z.looseObject({ items: z.array(z.unknown()) }).parse(JSON.parse(published.get('index.json') ?? ''));
  return { 'index.json': JSON.stringify({ ...index, items: index.items.slice(count) }) };
}

it('accepts a run that produced the published files', () =>
  expect(runRefusals({ candidate: candidate(), publishedIndex, rubrics, lock })).toEqual([]));

it('accepts a run in which 4 of 22 items vanished', () =>
  expect(runRefusals({ candidate: candidate(indexWithout(4)), publishedIndex, rubrics, lock })).toEqual([]));

it('refuses a run in which 7 of 22 items, about 30 percent, vanished', () =>
  expect(runRefusals({ candidate: candidate(indexWithout(7)), publishedIndex, rubrics, lock })).toEqual([
    'index.json: 7 of 22 published items vanished, more than 20 percent',
  ]));

it('refuses a file above its size cap', () => {
  const snapshots = Array.from({ length: 2000 }, (_, index) => ({ date: '2026-11-16', stars: index }));
  const path = 'popularity/gh.example-org.terse.json';
  const text = JSON.stringify({ schemaVersion: 1, id: 'gh.example-org.terse', snapshots }, null, 2);
  expect(runRefusals({ candidate: candidate({ [path]: text }), publishedIndex, rubrics, lock })).toEqual([
    'popularity/gh.example-org.terse.json: 120967 bytes, over the cap of 65536',
  ]);
});

it('refuses a run when a released rubric differs from its hash in the lock', () => {
  const hook = z.looseObject({ flagPenalties: z.array(z.unknown()) }).parse(rubrics['hook/1.0.0.json']);
  const edited = { ...hook, flagPenalties: [{ flag: 'hook-shell-command', points: 5 }] };
  expect(
    runRefusals({ candidate: candidate(), publishedIndex, rubrics: { ...rubrics, 'hook/1.0.0.json': edited }, lock }),
  ).toEqual(['rubrics/hook/1.0.0.json differs from its released version']);
});

const skillPath = 'records/skill/gh.example-org.skills.pdf-forms.json';

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
