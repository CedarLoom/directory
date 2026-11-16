import { expect, it } from 'vitest';
import { canonicalJson, contentHash } from './content-hash.ts';

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
