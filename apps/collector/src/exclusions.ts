import { createHmac } from 'node:crypto';
import { exclusionsFile } from '@directory/contracts';
import type { Candidate } from './candidate.ts';
import { repositoryId } from './github-location.ts';

/** The environment variable that holds the key of the exclusion hashes. */
export const exclusionsKeyVariable = 'EXCLUSIONS_KEY';

/** Answers whether an id is excluded. */
export type Exclusions = Pick<ReadonlySet<string>, 'has'>;

/** The exclusions of the file, matched by the HMAC-SHA-256 of an id under the key; a file without entries needs no key. */
export function parseExclusions(text: string, key: string): Exclusions {
  const hashes = new Set(exclusionsFile.parse(JSON.parse(text)).hashes);
  if (hashes.size === 0) return hashes;
  // Without the key no id matches, so every excluded item would be published again.
  if (key === '') throw new Error(`exclusions: the file holds entries; set ${exclusionsKeyVariable} to their key`);
  return { has: (id) => hashes.has(createHmac('sha256', key).update(id).digest('hex')) };
}

/** An excluded id, or an item whose container is one, such as a skill of an excluded plugin. */
export function isExcluded(
  { id, container }: { id: string; container?: string | undefined },
  excluded: Exclusions,
): boolean {
  return excluded.has(id) || (container !== undefined && excluded.has(container));
}

/** Leaves out the excluded ids, the items they contain and the items in an excluded repository. */
export function applyExclusions(candidates: readonly Candidate[], excluded: Exclusions): Candidate[] {
  return candidates.filter(
    (candidate) =>
      !isExcluded(candidate, excluded) &&
      (candidate.location === undefined || !excluded.has(repositoryId(candidate.location))),
  );
}
