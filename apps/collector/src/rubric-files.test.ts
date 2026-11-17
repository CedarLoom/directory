import { fileURLToPath } from 'node:url';
import { lockedRubrics } from '@directory/scoring';
import { expect, it } from 'vitest';
import { readRubricFiles } from './rubric-files.ts';

it('holds every rubric file under rubrics/ in the lock with its hash, and a file for every lock entry', async () => {
  const { rubrics, lock } = await readRubricFiles(fileURLToPath(new URL('../../../rubrics', import.meta.url)));
  expect(() => lockedRubrics(rubrics, lock)).not.toThrow();
});
