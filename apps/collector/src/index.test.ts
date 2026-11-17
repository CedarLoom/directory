import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const index = fileURLToPath(new URL('index.ts', import.meta.url));
const key = 'test-key-for-the-exclusion-hashes-only';

// Only the given variables, so a key set in the shell running the tests never reaches the command.
function hashExclusion(id: string, env: Record<string, string>) {
  return spawnSync(process.execPath, [index, 'hash-exclusion', id], { env, encoding: 'utf8' });
}

it('prints the hash the collector matches for an id, with the keyCheck', () => {
  const { status, stdout } = hashExclusion('gh.example-org.lint', { EXCLUSIONS_KEY: key });
  expect(status).toBe(0);
  // The keyed hashes of `exclusions` and gh.example-org.lint that exclusions.test.ts excludes the item with.
  expect(JSON.parse(stdout)).toEqual({
    keyCheck: '6dff3e273c8ce957d236e4400efe3ce0cc9cd9b4fe5ee08f2c9c59c950407f63',
    hashes: ['4fb16c1b2387b692ab7bebd3a47d064be2650b071892da87ebd36b423bbf6537'],
  });
});

it.each([
  ['a trailing newline', 'gh.example-org.lint\n'],
  ['a URL', 'https://github.com/example-org/lint'],
  ['an empty value', ''],
])('refuses %s as the id', (_, id) => {
  const { status, stdout, stderr } = hashExclusion(id, { EXCLUSIONS_KEY: key });
  expect(status).toBe(64);
  expect(stdout).toBe('');
  expect(stderr).toMatch(/not an item id/);
});

it('refuses to hash without a key and prints nothing', () => {
  const { status, stdout, stderr } = hashExclusion('gh.example-org.lint', {});
  expect(status).toBe(64);
  expect(stdout).toBe('');
  expect(stderr).toBe('exclusions: set EXCLUSIONS_KEY to the key of the hashes\n');
});
