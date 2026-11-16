import { describe, expect, it } from 'vitest';
import { disallowed, isAllowed } from './licenses.ts';

const allowed = new Set(['MIT', 'ISC', 'Apache-2.0']);

describe('isAllowed', () => {
  it('accepts an expression when one OR branch is fully allowed', () => {
    expect(isAllowed('(MIT OR GPL-3.0-only)', allowed)).toBe(true);
    expect(isAllowed('MIT AND ISC', allowed)).toBe(true);
  });

  it('refuses an AND with one license outside the list', () => {
    expect(isAllowed('MIT AND GPL-3.0-only', allowed)).toBe(false);
  });

  it('refuses a nested expression', () => {
    expect(isAllowed('MIT AND (ISC OR Apache-2.0)', allowed)).toBe(false);
  });
});

describe('disallowed', () => {
  const report = {
    MIT: [{ name: 'a', versions: ['1.0.0'] }],
    'GPL-3.0-only': [
      { name: 'b', versions: ['2.0.0', '2.1.0'] },
      { name: '@scope/c', versions: ['3.0.0'] },
    ],
  };

  it('lists each package outside the allow-list with its versions', () => {
    const config = { 'allow-licenses': ['MIT'] };
    expect(disallowed(report, config)).toEqual(['b@2.0.0,2.1.0: GPL-3.0-only', '@scope/c@3.0.0: GPL-3.0-only']);
  });

  it('skips a package exempted by its URL-encoded purl', () => {
    const config = { 'allow-licenses': ['MIT'], 'allow-dependencies-licenses': ['pkg:npm/%40scope/c'] };
    expect(disallowed(report, config)).toEqual(['b@2.0.0,2.1.0: GPL-3.0-only']);
  });

  it("fails with pnpm's own error when pnpm reports one", () => {
    const failure = { error: { code: 'ERR_PNPM_LICENSES_NO_LOCKFILE', message: 'No pnpm-lock.yaml found' } };
    expect(() => disallowed(failure, { 'allow-licenses': ['MIT'] })).toThrow(
      'pnpm licenses list failed: ERR_PNPM_LICENSES_NO_LOCKFILE: No pnpm-lock.yaml found',
    );
  });
});
