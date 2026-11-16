import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import indexFixture from '../fixtures/index.json' with { type: 'json' };
import metaFixture from '../fixtures/meta.json' with { type: 'json' };
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
  hookRecord,
  indexFile,
  marketplaceRecord,
  mcpServerRecord,
  metaFile,
  outputStyleRecord,
  pluginRecord,
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

  it('refuses a free-text field in a nested object', () =>
    expect(
      schema.safeParse({ ...fixture, license: { ...fixture.license, note: 'Free for personal use.' } }).error?.issues,
    ).toMatchObject([{ code: 'unrecognized_keys', keys: ['note'], path: ['license'] }]));

  it('refuses prose in the name', () =>
    expect(schema.safeParse({ ...fixture, name: 'Reviews your pull requests' }).error?.issues).toMatchObject([
      { code: 'invalid_format', path: ['name'] },
    ]));

  it('refuses an unknown SPDX id', () =>
    expect(
      schema.safeParse({ ...fixture, license: { ...fixture.license, spdx: 'Apache-3.0' } }).error?.issues,
    ).toMatchObject([{ code: 'invalid_value', path: ['license', 'spdx'] }]));
});

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
