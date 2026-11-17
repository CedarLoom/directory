import { readDataFolder } from './data-folder.ts';

/** The parsed rubric files of the folder by path, and its parsed `lock.json` apart from them. */
export async function readRubricFiles(folder: string) {
  const { 'lock.json': lock, ...rubrics } = Object.fromEntries(
    [...(await readDataFolder(folder))].map(([path, text]): [string, unknown] => [path, JSON.parse(text)]),
  );
  return { rubrics, lock };
}
