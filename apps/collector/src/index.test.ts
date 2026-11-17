import { spawnSync } from 'node:child_process';
import { mkdtempDisposable, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const index = fileURLToPath(new URL('index.ts', import.meta.url));
const key = 'test-key-for-the-exclusion-hashes-only';

// Only the given variables, so a key set in the shell running the tests never reaches the command; a file of its own,
// so the entries of curation/exclusions.json never decide the outcome.
async function hashExclusion(
  id: string,
  env: Record<string, string>,
  exclusions: object = { schemaVersion: 2, hashes: [] },
) {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'hash-exclusion-'));
  const file = join(folder.path, 'exclusions.json');
  await writeFile(file, JSON.stringify(exclusions));
  return spawnSync(process.execPath, [index, 'hash-exclusion', id, '--exclusions', file], { env, encoding: 'utf8' });
}

it('prints the hash the collector matches for an id, with the keyCheck', async () => {
  const { status, stdout } = await hashExclusion('gh.example-org.lint', { EXCLUSIONS_KEY: key });
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
])('refuses %s as the id', async (_, id) => {
  const { status, stdout, stderr } = await hashExclusion(id, { EXCLUSIONS_KEY: key });
  expect(status).toBe(64);
  expect(stdout).toBe('');
  expect(stderr).toMatch(/not an item id/);
});

it('refuses to hash without a key and prints nothing', async () => {
  const { status, stdout, stderr } = await hashExclusion('gh.example-org.lint', {});
  expect(status).toBe(64);
  expect(stdout).toBe('');
  expect(stderr).toMatch(/EXCLUSIONS_KEY/);
});

it('refuses a key other than the one of the entries in the file', async () => {
  // The keyCheck and the hash of gh.example-org.lint under the test key.
  const exclusions = {
    schemaVersion: 2,
    keyCheck: '6dff3e273c8ce957d236e4400efe3ce0cc9cd9b4fe5ee08f2c9c59c950407f63',
    hashes: ['4fb16c1b2387b692ab7bebd3a47d064be2650b071892da87ebd36b423bbf6537'],
  };
  const { status, stdout, stderr } = await hashExclusion(
    'gh.example-org.other',
    { EXCLUSIONS_KEY: 'another-test-key-for-the-exclusion-hashes' },
    exclusions,
  );
  expect(status).toBe(64);
  expect(stdout).toBe('');
  expect(stderr).toMatch(/does not match the keyCheck/);
});
