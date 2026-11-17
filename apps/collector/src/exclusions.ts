import { createHmac } from 'node:crypto';
import { exclusionsFile } from '@directory/contracts';
import type { Candidate } from './candidate.ts';
import { repositoryId } from './github-location.ts';

/** The environment variable that holds the key of the exclusion hashes. */
export const exclusionsKeyVariable = 'EXCLUSIONS_KEY';

/** Answers whether an id is excluded. */
export type Exclusions = Pick<ReadonlySet<string>, 'has'>;

/** The text whose hash under the key the file keeps as `keyCheck`; no id has this form. */
const keyCheckText = 'exclusions';

// The keyCheck is public, so a shorter key could be guessed offline and every hash matched to an earlier published id.
const minimumKeyBytes = 32;

/** A missing, short or wrong exclusions key, or a file without the keyCheck to test it against. */
export class ExclusionsKeyError extends Error {}

/** The HMAC-SHA-256 under the key, as lowercase hex; refuses a missing or short key. */
function keyedHash(key: string): (value: string) => string {
  if (key === '') throw new ExclusionsKeyError(`exclusions: set ${exclusionsKeyVariable} to the key of the hashes`);
  if (Buffer.byteLength(key) < minimumKeyBytes) {
    throw new ExclusionsKeyError(`exclusions: ${exclusionsKeyVariable} needs at least ${minimumKeyBytes} bytes`);
  }
  return (value) => createHmac('sha256', key).update(value).digest('hex');
}

/** The hash of an id as `hashes` holds it, with the `keyCheck` of the key. */
export function exclusionEntry(id: string, key: string): { keyCheck: string; hashes: string[] } {
  const hash = keyedHash(key);
  return { keyCheck: hash(keyCheckText), hashes: [hash(id)] };
}

/** The exclusions of the file, matched by the HMAC-SHA-256 of an id under the key; a file without entries needs no key. */
export function parseExclusions(text: string, key: string): Exclusions {
  const file = exclusionsFile.parse(JSON.parse(text));
  const hashes = new Set(file.hashes);
  if (hashes.size === 0) return hashes;
  // Without the right key no id matches, so every excluded item would be published again.
  const hash = keyedHash(key);
  if (file.keyCheck === undefined) {
    throw new ExclusionsKeyError(
      `exclusions: the file holds entries but no keyCheck; add the hash of the text \`${keyCheckText}\` under ${exclusionsKeyVariable}`,
    );
  }
  if (file.keyCheck !== hash(keyCheckText)) {
    throw new ExclusionsKeyError(`exclusions: ${exclusionsKeyVariable} does not match the keyCheck of the file`);
  }
  return { has: (id) => hashes.has(hash(id)) };
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
