// A released rubric never changes: refuses a `rubrics/lock.json` entry of the base commit that is changed or gone.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';

const lock = z.record(z.string(), z.string());

/** Each entry of the base lock that the current lock changes or removes; an added entry passes. */
export function lockEdits(baseJson: unknown, currentJson: unknown): string[] {
  const base = lock.parse(baseJson);
  const current = new Map(Object.entries(lock.parse(currentJson)));
  return Object.entries(base).flatMap(([path, hash]) => {
    const now = current.get(path);
    if (now === undefined) return [`rubrics/${path}: removed from the lock`];
    return now === hash ? [] : [`rubrics/${path}: hash changed from ${hash} to ${now}`];
  });
}

const run = promisify(execFile);
const git = async (...args: string[]) => (await run('git', args)).stdout.trim();

/** Where HEAD left origin/main; on main itself, and in a CI checkout of a pull request's merge commit, its first parent. */
async function baseCommit(): Promise<string> {
  const [head = '', firstParent = ''] = (await git('log', '-1', '--format=%H %P', 'HEAD')).split(' ');
  const main = await git('for-each-ref', '--format=%(objectname)', 'refs/remotes/origin/main');
  const forkPoint = main === '' ? head : await git('merge-base', 'HEAD', main);
  if (forkPoint !== head) return forkPoint;
  if (firstParent === '') throw new Error('rubric-lock: HEAD has no parent in this clone; fetch at least two commits');
  return firstParent;
}

if (import.meta.main) {
  const base = await baseCommit();
  const edits = lockEdits(
    JSON.parse(await git('show', `${base}:rubrics/lock.json`)),
    JSON.parse(await readFile('rubrics/lock.json', 'utf8')),
  );
  if (edits.length > 0) {
    console.error(`A released rubric never changes; release a new version instead:\n${edits.join('\n')}`);
    process.exit(1);
  }
  console.log(`rubrics/lock.json keeps every entry of ${base}.`);
}
