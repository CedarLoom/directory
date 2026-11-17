import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { DataFiles } from './data-files.ts';

const missing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** One file of the data folder by relative path with `/` separators; undefined when it does not exist yet. */
export async function readDataFile(folder: string, path: string): Promise<string | undefined> {
  try {
    return await readFile(join(folder, ...path.split('/')), 'utf8');
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

/** Every path under the folder, relative to it; a folder not yet created holds none. */
async function listFolder(folder: string): Promise<string[]> {
  try {
    return await readdir(folder, { recursive: true });
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

/** The JSON files and the `LICENSE` of the data folder by relative path with `/` separators; a folder not yet created holds none. */
export async function readDataFolder(folder: string): Promise<Map<string, string>> {
  const files = (await listFolder(folder)).filter((path) => path.endsWith('.json') || path === 'LICENSE');
  const texts = await Promise.all(files.map((path) => readFile(join(folder, path), 'utf8')));
  return new Map(files.map((path, index) => [path.split(sep).join('/'), texts[index] ?? '']));
}

/** Removes each file, by relative path with `/` separators, from the folder. */
async function removeDataFiles(folder: string, paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(join(folder, ...path.split('/')))));
}

/** The temporary files an earlier stopped write left, which no later step may stage; git's own folder is not touched. */
async function staleTemporaries(folder: string): Promise<string[]> {
  const paths = await listFolder(folder);
  return paths
    .filter((path) => path.endsWith('.tmp') && !path.startsWith(`.git${sep}`))
    .map((path) => path.split(sep).join('/'));
}

/**
 * Removes the files a publish drops and the temporary files of an earlier stopped write, then writes its files: a stop
 * in between leaves the earlier `departures.json`, so no file still on disk loses its date.
 */
export async function updateDataFolder(folder: string, files: DataFiles, removed: readonly string[]): Promise<void> {
  await removeDataFiles(folder, [...removed, ...(await staleTemporaries(folder))]);
  await writeDataFolder(folder, files);
}

/** Writes each file into the folder, never leaving a cut one on a stop or a failed write; a file not given stays as it is. */
export async function writeDataFolder(
  folder: string,
  files: DataFiles,
  write: (path: string, text: string) => Promise<void> = writeFile,
): Promise<void> {
  await Promise.all(
    [...files].map(async ([path, text]) => {
      const target = join(folder, ...path.split('/'));
      // Not a `.json` name, so a folder read never takes it for a data file.
      const temporary = `${target}.tmp`;
      await mkdir(dirname(target), { recursive: true });
      try {
        await write(temporary, text);
        await rename(temporary, target);
      } catch (error) {
        // A failed cleanup must not replace the write error, the one to report.
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    }),
  );
}
