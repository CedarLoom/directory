import { classifySource, marketplaceEntry, type Pin, type SourceKind, sourceKind } from '@directory/contracts';
import { ZodError } from 'zod';

interface EntrySource {
  kind: SourceKind;
  pin: Pin;
}

/** The plugin entries of a marketplace file and the source of each entry that parses. */
export interface MarketplaceEntries {
  count: number;
  sources: EntrySource[];
}

// A branch or tag ref can move; a commit, an exact version and the marketplace's own commit cannot.
const pinned: ReadonlySet<Pin> = new Set(['sha', 'version', 'marketplace-commit']);

/** The source of each entry; an entry the contracts refuse is counted in `count` only. */
export function entrySources(plugins: readonly unknown[]): MarketplaceEntries {
  const sources = plugins.flatMap((plugin) => {
    const entry = marketplaceEntry.safeParse(plugin);
    if (!entry.success) return [];
    try {
      return [classifySource(entry.data.source)];
    } catch (error) {
      if (error instanceof ZodError) return [];
      throw error;
    }
  });
  return { count: plugins.length, sources };
}

export function analyzeMarketplace({ count, sources }: MarketplaceEntries) {
  // Every kind gets a count, zero included.
  const sourceKinds = Object.fromEntries(sourceKind.options.map((kind) => [kind, 0]));
  for (const { kind } of sources) sourceKinds[kind] = (sourceKinds[kind] ?? 0) + 1;
  const pinnedCount = sources.filter(({ pin }) => pinned.has(pin)).length;
  return {
    pluginCount: count,
    sourceKinds,
    pinnedShare: sources.length === 0 ? 0 : Math.round((pinnedCount / sources.length) * 1000) / 1000,
  };
}
