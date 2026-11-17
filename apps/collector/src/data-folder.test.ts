import { mkdir, mkdtempDisposable, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { updateDataFolder } from './data-folder.ts';

it('keeps departures.json as it was when a removal fails', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await mkdir(join(folder.path, 'history'));
  await writeFile(join(folder.path, 'departures.json'), 'before');
  const update = updateDataFolder(folder.path, new Map([['departures.json', 'after']]), ['history/gone.json']);
  await expect(update).rejects.toThrow(/ENOENT/);
  expect(await readFile(join(folder.path, 'departures.json'), 'utf8')).toBe('before');
});
