import { exclusionsFile } from '@directory/contracts';
import type { Candidate } from './candidate.ts';
import { repositoryId } from './github-location.ts';

export function parseExclusions(text: string): ReadonlySet<string> {
  return new Set(exclusionsFile.parse(JSON.parse(text)).ids);
}

/** An excluded id, or an item whose container is one, such as a skill of an excluded plugin. */
export function isExcluded(
  { id, container }: { id: string; container?: string | undefined },
  excluded: ReadonlySet<string>,
): boolean {
  return excluded.has(id) || (container !== undefined && excluded.has(container));
}

/** Leaves out the excluded ids, the items they contain and the items in an excluded repository. */
export function applyExclusions(candidates: readonly Candidate[], excluded: ReadonlySet<string>): Candidate[] {
  return candidates.filter(
    (candidate) =>
      !isExcluded(candidate, excluded) &&
      (candidate.location === undefined || !excluded.has(repositoryId(candidate.location))),
  );
}
