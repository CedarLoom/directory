import { mkdir, mkdtempDisposable, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { updateDataFolder, writeDataFolder } from './data-folder.ts';

/** A write that stops after part of the text, as on a full disk. */
async function cutWrite(path: string, text: string): Promise<void> {
  await writeFile(path, text.slice(0, 2));
  throw new Error('ENOSPC: no space left on device');
}

it('keeps the old file and leaves no temporary file when a write fails', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await writeFile(join(folder.path, 'index.json'), 'before');
  const write = writeDataFolder(folder.path, new Map([['index.json', 'after']]), cutWrite);
  await expect(write).rejects.toThrow('ENOSPC');
  expect(await readdir(folder.path)).toEqual(['index.json']);
  expect(await readFile(join(folder.path, 'index.json'), 'utf8')).toBe('before');
});

/** A write that leaves a non-empty folder at the temporary path, which the cleanup's `rm` without `recursive` refuses. */
async function blockedWrite(path: string): Promise<void> {
  await mkdir(join(path, 'inner'), { recursive: true });
  throw new Error('ENOSPC: no space left on device');
}

it('reports the write error when the cleanup of the temporary file fails too', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  const write = writeDataFolder(folder.path, new Map([['index.json', 'after']]), blockedWrite);
  await expect(write).rejects.toThrow('ENOSPC');
});

it('removes the temporary files of a stopped write when a publish writes', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await mkdir(join(folder.path, 'history'));
  await writeFile(join(folder.path, 'history', 'old.json.tmp'), 'cut');
  await updateDataFolder(folder.path, new Map([['index.json', 'after']]), []);
  expect(await readdir(folder.path, { recursive: true })).toEqual(['history', 'index.json']);
});

it('keeps departures.json as it was when a removal fails', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await mkdir(join(folder.path, 'history'));
  await writeFile(join(folder.path, 'departures.json'), 'before');
  const update = updateDataFolder(folder.path, new Map([['departures.json', 'after']]), ['history/gone.json']);
  await expect(update).rejects.toThrow(/ENOENT/);
  expect(await readFile(join(folder.path, 'departures.json'), 'utf8')).toBe('before');
});
