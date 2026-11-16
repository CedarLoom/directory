import { exclusionsFile } from '@directory/contracts';
import type { Candidate } from './candidate.ts';

export function parseExclusions(text: string): ReadonlySet<string> {
  return new Set(exclusionsFile.parse(JSON.parse(text)).ids);
}

/** Leaves out the excluded ids and the items they contain, such as the skills of an excluded plugin. */
export function applyExclusions(candidates: readonly Candidate[], excluded: ReadonlySet<string>): Candidate[] {
  return candidates.filter(
    ({ id, container }) => !excluded.has(id) && (container === undefined || !excluded.has(container)),
  );
}
