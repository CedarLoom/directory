import type { Kind, Rubric } from '../data-types.ts';
import { runMeta } from '../meta-data.ts';
import { kinds } from '../vocabulary.ts';

const files = import.meta.glob<Rubric>('../../../../rubrics/*/*.json', { eager: true, import: 'default' });

function rubricOf(kind: Kind): Rubric {
  const version = runMeta.rubricVersions[kind];
  const rubric = files[`../../../../rubrics/${kind}/${version}.json`];
  if (rubric === undefined) throw new Error(`The data names ${kind} rubric ${version}, which is not released`);
  return rubric;
}

/** The rubric of each kind that scored the data. */
export const rubrics: readonly Rubric[] = kinds.map(rubricOf);
