import type { Pin, SourceId, SourceKind } from '@directory/contracts';
import { type GitHubLocation, repositoryId } from './github-location.ts';
import type { HookFacts } from './hook-analyzer.ts';
import type { MarketplaceEntries } from './marketplace-analyzer.ts';
import type { McpServerFacts } from './mcp-server-analyzer.ts';

/** A candidate GitHub holds; only these get records. */
export type Located = Candidate & { location: GitHubLocation };

/** An item a source names, before analysis: ids, names, links and facts, no third-party text. */
export interface Candidate {
  kind: 'marketplace' | 'plugin' | 'skill' | 'agent' | 'hook' | 'mcp-server' | 'output-style';
  id: string;
  name: string;
  links: { source?: string; homepage?: string; registry?: string };
  /** Where the item lives on GitHub; absent for npm, archive and command sources, other hosts and an MCP server without a GitHub repository. */
  location?: GitHubLocation;
  /** The id of the plugin a skill, agent, hooks file or output style belongs to. */
  container?: string;
  /** Ids of the marketplaces that list the item. */
  listedIn: string[];
  provenance: SourceId[];
  /** A plugin's source kind and pin as its marketplace entry sets them. */
  source?: { kind: SourceKind; pin: Pin };
  /**
   * The license field of a plugin's marketplace entry when the plugin sits in the marketplace's own repository; it is the
   * plugin manifest's license field when the plugin has no plugin.json or one with an empty or no license field.
   */
  entryLicense?: string;
  /** A marketplace's plugin entries. */
  entries?: MarketplaceEntries;
  /** A hooks file's facts, read when the inspection found it. */
  hooks?: HookFacts;
  /** An MCP server's facts as its registry entry gives them. */
  mcpServer?: McpServerFacts;
}

function union<T>(first: readonly T[], second: readonly T[]): T[] {
  return [...new Set([...first, ...second])];
}

/**
 * Joins candidates of one kind and id, such as a plugin two marketplaces list, keeping the first one's facts but an entry
 * license, which only the entry in the plugin's own repository carries.
 */
export function mergeCandidates(candidates: readonly Candidate[]): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind} ${candidate.id}`;
    const seen = merged.get(key);
    const entryLicense = seen?.entryLicense ?? candidate.entryLicense;
    merged.set(
      key,
      seen === undefined
        ? candidate
        : {
            ...seen,
            listedIn: union(seen.listedIn, candidate.listedIn),
            provenance: union(seen.provenance, candidate.provenance),
            ...(entryLicense === undefined ? {} : { entryLicense }),
          },
    );
  }
  return [...merged.values()];
}

/** The only value of a list, or undefined for an empty list or one of several values. */
export function sole<T>(values: readonly T[]): T | undefined {
  const [only, ...others] = values;
  return others.length === 0 ? only : undefined;
}

/**
 * Gives a plugin listed at the root of a repository whose own marketplace lists one plugin there that plugin's id, and
 * its listed skills that container, so both listings join; with several there, which one it is cannot be told.
 */
export function joinRootPlugins(candidates: readonly Candidate[]): Candidate[] {
  const own = new Map<string, Set<string>>();
  for (const { kind, id, location } of candidates) {
    // At a repository root only an entry of the repository's own marketplace has an id other than the repository's.
    if (kind !== 'plugin' || location?.path !== '' || id === repositoryId(location)) continue;
    own.set(repositoryId(location), (own.get(repositoryId(location)) ?? new Set()).add(id));
  }
  const ids = new Map(
    [...own].flatMap(([repository, named]) => {
      const only = sole([...named]);
      return only === undefined ? [] : [[repository, only] as const];
    }),
  );
  return candidates.map((candidate) => {
    const id = candidate.kind === 'plugin' ? ids.get(candidate.id) : undefined;
    const container = candidate.container === undefined ? undefined : ids.get(candidate.container);
    if (id === undefined && container === undefined) return candidate;
    return { ...candidate, ...(id === undefined ? {} : { id }), ...(container === undefined ? {} : { container }) };
  });
}
