import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import departuresFixture from '../fixtures/departures.json' with { type: 'json' };
import exclusionsFixture from '../fixtures/exclusions.json' with { type: 'json' };
import historyFixture from '../fixtures/history.json' with { type: 'json' };
import indexFixture from '../fixtures/index.json' with { type: 'json' };
import metaFixture from '../fixtures/meta.json' with { type: 'json' };
import popularityFixture from '../fixtures/popularity.json' with { type: 'json' };
import agent from '../fixtures/records/agent.json' with { type: 'json' };
import hook from '../fixtures/records/hook.json' with { type: 'json' };
import marketplace from '../fixtures/records/marketplace.json' with { type: 'json' };
import mcpServer from '../fixtures/records/mcp-server.json' with { type: 'json' };
import outputStyle from '../fixtures/records/output-style.json' with { type: 'json' };
import plugin from '../fixtures/records/plugin.json' with { type: 'json' };
import skill from '../fixtures/records/skill.json' with { type: 'json' };
import rubricFixture from '../fixtures/rubric.json' with { type: 'json' };
import {
  agentRecord,
  departuresFile,
  exclusionsFile,
  historyFile,
  hookRecord,
  indexFile,
  marketplaceRecord,
  mcpServerRecord,
  metaFile,
  outputStyleRecord,
  pluginRecord,
  popularityFile,
  rubricFile,
  skillRecord,
} from './index.ts';

const records = [
  ['marketplace', marketplaceRecord, marketplace],
  ['plugin', pluginRecord, plugin],
  ['skill', skillRecord, skill],
  ['agent', agentRecord, agent],
  ['hook', hookRecord, hook],
  ['mcp-server', mcpServerRecord, mcpServer],
  ['output-style', outputStyleRecord, outputStyle],
] as const;

const files = [
  ...records,
  ['index', indexFile, indexFixture],
  ['meta', metaFile, metaFixture],
  ['rubric', rubricFile, rubricFixture],
  ['exclusions', exclusionsFile, exclusionsFixture],
  ['departures', departuresFile, departuresFixture],
  ['history', historyFile, historyFixture],
  ['popularity', popularityFile, popularityFixture],
] as const;

describe.each(files)('%s', (name, schema, fixture) => {
  it('matches its committed JSON Schema', async () => {
    const generated = `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`;
    await expect(generated).toMatchFileSnapshot(`../schemas/v1/${name}.schema.json`);
  });

  it('accepts its fixture', () => expect(schema.safeParse(fixture).error).toBeUndefined());
});

describe.each(records)('%s record', (_kind, schema, fixture) => {
  it('refuses a free-text field', () =>
    expect(schema.safeParse({ ...fixture, description: 'Reviews your pull requests.' }).error?.issues).toMatchObject([
      { code: 'unrecognized_keys', keys: ['description'], path: [] },
    ]));

  it('accepts a record without a score', () =>
    expect(schema.safeParse(without(fixture, 'score')).error).toBeUndefined());

  it('refuses prose in the name', () =>
    expect(schema.safeParse({ ...fixture, name: 'Reviews your pull requests' }).error?.issues).toMatchObject([
      { code: 'invalid_format', path: ['name'] },
    ]));

  it('refuses an unknown SPDX id', () =>
    expect(
      schema.safeParse({ ...fixture, license: { ...fixture.license, spdx: 'Apache-3.0' } }).error?.issues,
    ).toMatchObject([
      { code: 'invalid_format', path: ['license', 'spdx'] },
      { code: 'custom', path: ['license', 'spdx'] },
    ]));

  it('accepts an SPDX expression of listed ids', () =>
    expect(
      [
        'MIT OR Apache-2.0',
        '(GPL-2.0-or-later OR ISC) AND MIT',
        'GPL-2.0-only WITH Classpath-exception-2.0 OR Apache-1.0+',
      ].filter((spdx) => !schema.safeParse({ ...fixture, license: { ...fixture.license, spdx } }).success),
    ).toEqual([]));

  it('refuses a malformed SPDX expression, one with a LicenseRef or an unlisted exception, and another spelling', () =>
    expect(
      [
        'MIT OR',
        'MIT or Apache-2.0',
        '(MIT',
        ' MIT',
        'MIT\nOR ISC',
        'MIT OR LicenseRef-Call-555-0100',
        'GPL-2.0-only WITH Visit-example.com',
        'MIT WITH MIT',
        '(MIT)',
        'MIT  OR ISC',
        'mit',
        'GPL-2.0+',
        'MIT AND (ISC AND 0BSD)',
        '(MIT AND ISC) OR 0BSD',
      ].filter((spdx) => schema.safeParse({ ...fixture, license: { ...fixture.license, spdx } }).success),
    ).toEqual([]));
});

type Path = readonly (string | number)[];
const commonObjects: Path[] = [
  ['links'],
  ['license'],
  ['popularity', 0],
  ['cedarloomFit'],
  ['score'],
  ['score', 'rubric'],
  ['score', 'parts', 0],
];
const maintenanceObjects: Path[] = [['maintenance'], ['maintenance', 'latestRelease']];
const objects: [string, z.ZodType, unknown, Path[]][] = [
  ['marketplace', marketplaceRecord, marketplace, [...commonObjects, ...maintenanceObjects]],
  ['plugin', pluginRecord, plugin, [...commonObjects, ...maintenanceObjects, ['components']]],
  ['skill', skillRecord, skill, [...commonObjects, ...maintenanceObjects, ['tokens'], ['files']]],
  ['agent', agentRecord, agent, [...commonObjects, ...maintenanceObjects, ['tokens']]],
  ['hook', hookRecord, hook, [...commonObjects, ...maintenanceObjects]],
  // The MCP server fixture has no popularity entry and no maintenance facts.
  ['mcp-server', mcpServerRecord, mcpServer, commonObjects.filter(([key]) => key !== 'popularity')],
  ['output-style', outputStyleRecord, outputStyle, [...commonObjects, ...maintenanceObjects]],
  ['index', indexFile, indexFixture, [[], ['items', 0]]],
  ['meta', metaFile, metaFixture, [[], ['sources', 0], ['stats']]],
  ['rubric', rubricFile, rubricFixture, [[], ['signals', 0], ['signals', 0, 'scale'], ['flagPenalties', 0]]],
  ['exclusions', exclusionsFile, exclusionsFixture, [[]]],
  ['history', historyFile, historyFixture, [[], ['entries', 0]]],
  ['popularity', popularityFile, popularityFixture, [[], ['snapshots', 0]]],
];

function isObject(value: unknown): value is Record<string | number, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A copy of `value` with a free-text key added to the object at `path`. */
function withNote(value: unknown, path: Path): unknown {
  const copy = structuredClone(value);
  const target = path.reduce<unknown>((object, key) => (isObject(object) ? object[key] : undefined), copy);
  if (!isObject(target)) throw new Error(`The fixture has no object at ${path.join('.')}`);
  target['note'] = 'Free for personal use.';
  return copy;
}

function without(value: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

describe.each(objects)('%s', (_name, schema, fixture, paths) => {
  it.each(paths.map((path) => [path.join('.') || 'the top level', path] as const))(
    'refuses a free-text field at %s',
    (_at, path) =>
      expect(schema.safeParse(withNote(fixture, path)).error?.issues).toMatchObject([
        { code: 'unrecognized_keys', keys: ['note'], path },
      ]),
  );
});

describe('license', () => {
  it.each(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1'])('accepts %s, a deprecated id GitHub detects', (spdx) =>
    expect(
      pluginRecord.safeParse({ ...plugin, license: { spdx, source: 'github-detected', class: 'copyleft' } }).error,
    ).toBeUndefined(),
  );
});

it('accepts a plugin on another git host, which has no source link or maintenance facts', () =>
  expect(
    pluginRecord.safeParse({
      ...without(plugin, 'maintenance'),
      links: { homepage: plugin.links.homepage },
      sourceKind: 'url',
      pin: 'sha',
    }).error,
  ).toBeUndefined());

it('refuses a star count in a record, which keeps a pointer to the popularity file', () =>
  expect(
    skillRecord.safeParse({
      ...skill,
      popularity: [{ signal: 'stars', value: 412, scope: 'repository', source: 'github' }],
    }).error?.issues,
  ).toMatchObject([
    { code: 'invalid_type', path: ['popularity', 0, 'ref'] },
    { code: 'unrecognized_keys', keys: ['value'], path: ['popularity', 0] },
  ]));

it('accepts an index row without a score', () =>
  expect(
    indexFile.safeParse({ ...indexFixture, items: indexFixture.items.map((item) => without(item, 'score')) }).error,
  ).toBeUndefined());

describe('links', () => {
  it.each([
    'http://github.com/example-org/plugins',
    'https://example.org/plugins',
    'https://github.com.example.org/plugins',
    'https://user:secret@github.com/example-org/plugins',
    'https://github.com:8443/example-org/plugins',
    'https://github.com/example-org/plugins?ref=directory',
  ])('refuses %s', (url) =>
    expect(pluginRecord.safeParse({ ...plugin, links: { ...plugin.links, source: url } }).error?.issues).toMatchObject([
      { code: 'invalid_format', path: ['links', 'source'] },
    ]),
  );
});
