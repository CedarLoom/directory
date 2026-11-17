import { mkdir, mkdtempDisposable, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { readDataFolder, updateDataFolder, writeDataFolder } from './data-folder.ts';

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
  expect((await readdir(folder.path, { recursive: true })).toSorted()).toEqual(['history', 'index.json']);
});

it('keeps the temporary files a symbolic link inside the data folder points to', async () => {
  await using outside = await mkdtempDisposable(join(tmpdir(), 'data-folder-outside-'));
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await writeFile(join(outside.path, 'other.tmp'), 'not data');
  await symlink(outside.path, join(folder.path, 'link'));
  await updateDataFolder(folder.path, new Map([['index.json', 'after']]), []);
  expect(await readdir(outside.path)).toEqual(['other.tmp']);
});

it('reads no file behind a symbolic link in the data folder', async () => {
  await using outside = await mkdtempDisposable(join(tmpdir(), 'data-folder-outside-'));
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await writeFile(join(outside.path, 'secret.json'), '{}');
  await writeFile(join(folder.path, 'index.json'), '{}');
  await symlink(join(outside.path, 'secret.json'), join(folder.path, 'stolen.json'));
  expect([...(await readDataFolder(folder.path)).keys()]).toEqual(['index.json']);
});

/** A write that holds every call until the test releases it, so the calls that run together can be seen. */
function heldWrites(folder: string) {
  const held: { path: string; release: () => void }[] = [];
  let waiting: { count: number; resolve: () => void } | undefined;
  async function write(path: string, text: string): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    held.push({ path: relative(folder, path), release: resolve });
    if (waiting !== undefined && held.length >= waiting.count) waiting.resolve();
    await promise;
    await writeFile(path, text);
  }
  /** Waits until `count` writes are held, then releases every held write and returns their paths. */
  async function release(count: number): Promise<string[]> {
    if (held.length < count) {
      const { promise, resolve } = Promise.withResolvers<void>();
      waiting = { count, resolve };
      await promise;
    }
    const stage = held.splice(0);
    for (const call of stage) call.release();
    return stage.map(({ path }) => path).toSorted();
  }
  return { write, release };
}

it('writes index.json after every other file and meta.json after index.json', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  const files = new Map([
    ['meta.json', 'meta'],
    ['index.json', 'index'],
    ['records/skill/a.json', 'record'],
    ['history/skill/a.json', 'history'],
  ]);
  const writes = heldWrites(folder.path);
  const written = writeDataFolder(folder.path, files, writes.write);
  expect(await writes.release(2)).toEqual(['history/skill/a.json.tmp', 'records/skill/a.json.tmp']);
  expect(await writes.release(1)).toEqual(['index.json.tmp']);
  expect(await writes.release(1)).toEqual(['meta.json.tmp']);
  await written;
});

it('keeps departures.json as it was when a removal fails', async () => {
  await using folder = await mkdtempDisposable(join(tmpdir(), 'data-folder-'));
  await mkdir(join(folder.path, 'history'));
  await writeFile(join(folder.path, 'departures.json'), 'before');
  const update = updateDataFolder(folder.path, new Map([['departures.json', 'after']]), ['history/gone.json']);
  await expect(update).rejects.toThrow(/ENOENT/);
  expect(await readFile(join(folder.path, 'departures.json'), 'utf8')).toBe('before');
});
