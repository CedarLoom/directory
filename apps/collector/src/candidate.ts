import type { Pin, SourceId, SourceKind } from '@directory/contracts';
import type { GitHubLocation } from './github-location.ts';
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
   * plugin manifest's license field when the plugin has no plugin.json.
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
