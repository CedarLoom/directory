import type { Kind, Rubric } from '../data-types.ts';
import { runMeta } from '../meta-data.ts';
import { kinds } from '../vocabulary.ts';

// A lazy glob: Vite emits one chunk per rubric version, so the method page loads only the versions that scored the data.
const files = import.meta.glob<Rubric>('../../../../rubrics/*/*.json', { import: 'default' });

function rubricOf(kind: Kind): Promise<Rubric> {
  const version = runMeta.rubricVersions[kind];
  const load = files[`../../../../rubrics/${kind}/${version}.json`];
  if (load === undefined) throw new Error(`The data names ${kind} rubric ${version}, which is not released`);
  return load();
}

/** The rubric of each kind that scored the data. */
export function loadRubrics(): Promise<Rubric[]> {
  return Promise.all(kinds.map(rubricOf));
}
