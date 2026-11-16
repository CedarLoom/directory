import { expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { canonicalJson, contentHash } from './content-hash.ts';
import {
  agentRecord,
  hookRecord,
  marketplaceRecord,
  mcpServerRecord,
  outputStyleRecord,
  pluginRecord,
  skillRecord,
} from './item.ts';
import { indexFile } from './listing.ts';
import { metaFile } from './meta.ts';
import { rubricFile } from './rubric.ts';

const record = { f: true, b: { c: [2, { e: null, d: 'é' }] }, a: 1 };
const reordered = { a: 1, b: { c: [2, { d: 'é', e: null }] }, f: true };

it('gives two records that differ only in key order the same hash', () => {
  expect(contentHash(record)).toBe('0490021e0e6e8f3bf14c4bb798425c15580a31916ca6416ba40d287088f1997b');
  expect(contentHash(reordered)).toBe('0490021e0e6e8f3bf14c4bb798425c15580a31916ca6416ba40d287088f1997b');
});

it('changes the hash when array order changes', () =>
  expect(contentHash({ ...record, b: { c: [{ e: null, d: 'é' }, 2] } })).not.toBe(
    '0490021e0e6e8f3bf14c4bb798425c15580a31916ca6416ba40d287088f1997b',
  ));

it('sorts keys by code unit, so integer-like keys keep string order', () =>
  expect(canonicalJson({ a: 4, B: 3, '2': 2, '10': 1 })).toBe('{"10":1,"2":2,"B":3,"a":4}'));

it('refuses a number JSON cannot hold', () => expect(() => canonicalJson({ total: Number.NaN })).toThrow(RangeError));

it('leaves out a key whose value is undefined, as JSON.stringify does', () => {
  expect(contentHash({ a: 1, b: undefined })).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
  expect(contentHash({ a: 1 })).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
});

it('takes every parsed record and file as input', () =>
  expectTypeOf<
    z.output<
      | typeof marketplaceRecord
      | typeof pluginRecord
      | typeof skillRecord
      | typeof agentRecord
      | typeof hookRecord
      | typeof mcpServerRecord
      | typeof outputStyleRecord
      | typeof indexFile
      | typeof metaFile
      | typeof rubricFile
    >
  >().toExtend<Parameters<typeof contentHash>[0]>());
