import type { Pin, SourceId, SourceKind } from '@directory/contracts';

/** An item a source names, before analysis: ids, names, links and facts, no third-party text. */
export interface Candidate {
  kind: 'marketplace' | 'plugin' | 'skill';
  id: string;
  name: string;
  links: { source?: string; homepage?: string };
  /** The id of the plugin a skill belongs to. */
  container?: string;
  /** Ids of the marketplaces that list the item. */
  listedIn: string[];
  provenance: SourceId[];
  /** A plugin's source kind and pin as its marketplace entry sets them. */
  source?: { kind: SourceKind; pin: Pin };
}

function union<T>(first: readonly T[], second: readonly T[]): T[] {
  return [...new Set([...first, ...second])];
}

/** Joins candidates of one kind and id, such as a plugin two marketplaces list, keeping the first one's facts. */
export function mergeCandidates(candidates: readonly Candidate[]): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind} ${candidate.id}`;
    const seen = merged.get(key);
    merged.set(
      key,
      seen === undefined
        ? candidate
        : {
            ...seen,
            listedIn: union(seen.listedIn, candidate.listedIn),
            provenance: union(seen.provenance, candidate.provenance),
          },
    );
  }
  return [...merged.values()];
}
