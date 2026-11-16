import type { Pin, SourceId, SourceKind } from '@directory/contracts';
import type { GitHubLocation } from './github-location.ts';
import type { MarketplaceEntries } from './marketplace-analyzer.ts';

/** A candidate GitHub holds; only these get records. */
export type Located = Candidate & { location: GitHubLocation };

/** An item a source names, before analysis: ids, names, links and facts, no third-party text. */
export interface Candidate {
  kind: 'marketplace' | 'plugin' | 'skill' | 'agent';
  id: string;
  name: string;
  links: { source?: string; homepage?: string };
  /** Where the item lives on GitHub; absent for npm, archive and command sources and other hosts. */
  location?: GitHubLocation;
  /** The id of the plugin a skill belongs to. */
  container?: string;
  /** Ids of the marketplaces that list the item. */
  listedIn: string[];
  provenance: SourceId[];
  /** A plugin's source kind and pin as its marketplace entry sets them. */
  source?: { kind: SourceKind; pin: Pin };
  /** A marketplace's plugin entries. */
  entries?: MarketplaceEntries;
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
