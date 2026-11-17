import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

/** The JSON files of the data folder by relative path with `/` separators; a folder not yet created holds none. */
export async function readDataFolder(folder: string): Promise<Map<string, string>> {
  let paths: string[];
  try {
    paths = await readdir(folder, { recursive: true });
  } catch (error) {
    if (missing(error)) return new Map();
    throw error;
  }
  const json = paths.filter((path) => path.endsWith('.json'));
  const texts = await Promise.all(json.map((path) => readFile(join(folder, path), 'utf8')));
  return new Map(json.map((path, index) => [path.split(sep).join('/'), texts[index] ?? '']));
}

/** Writes each file into the folder; a file not given stays as it is. */
export async function writeDataFolder(folder: string, files: DataFiles): Promise<void> {
  await Promise.all(
    [...files].map(async ([path, text]) => {
      const target = join(folder, ...path.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
    }),
  );
}
