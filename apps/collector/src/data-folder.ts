import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { DataFiles } from './data-files.ts';

/** The JSON files of the data folder by relative path with `/` separators; a folder not yet created holds none. */
export async function readDataFolder(folder: string): Promise<Map<string, string>> {
  let paths: string[];
  try {
    paths = await readdir(folder, { recursive: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return new Map();
    throw error;
  }
  const json = paths.filter((path) => path.endsWith('.json'));
  const texts = await Promise.all(json.map((path) => readFile(join(folder, path), 'utf8')));
  return new Map(json.map((path, index) => [path.split(sep).join('/'), texts[index] ?? '']));
}

/** Writes each file whose text differs from the previous run's; a file this run did not produce stays as it is. */
export async function writeDataFolder(folder: string, files: DataFiles, previous: DataFiles): Promise<number> {
  const changed = [...files].filter(([path, text]) => previous.get(path) !== text);
  await Promise.all(
    changed.map(async ([path, text]) => {
      const target = join(folder, ...path.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
    }),
  );
  return changed.length;
}
