import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const git = promisify(execFile);

/** Stages every change under the folder and commits it in the folder's git work tree; false when nothing changed. */
export async function commitDataFolder(folder: string, message: string): Promise<boolean> {
  await git('git', ['add', '--all', '--', '.'], { cwd: folder });
  const { stdout } = await git('git', ['diff', '--cached', '--name-only', '--', '.'], { cwd: folder });
  if (stdout === '') return false;
  await git('git', ['commit', '--quiet', '--message', message, '--', '.'], { cwd: folder });
  return true;
}
