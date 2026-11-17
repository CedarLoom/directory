import { classifySource, marketplaceEntry, type Pin, type SourceKind, sourceKind } from '@directory/contracts';
import { ZodError, z } from 'zod';

interface EntrySource {
  kind: SourceKind;
  pin: Pin;
}

/** The plugin entries of a marketplace file and the source of each entry that parses. */
export interface MarketplaceEntries {
  count: number;
  sources: EntrySource[];
  /** Entries that give a category and a homepage. */
  described: number;
  /** Two entries that parse share a name. */
  duplicateNames: boolean;
}

// Only presence is read; the values are third-party text.
const describedEntry = z.object({ category: z.string().min(1), homepage: z.string().min(1) });

// A branch or tag ref can move; a commit, an exact version and the marketplace's own commit cannot.
const pinned: ReadonlySet<Pin> = new Set(['sha', 'version', 'marketplace-commit']);

/** The source of each entry; an entry the contracts refuse is counted in `count` only. */
export function entrySources(plugins: readonly unknown[]): MarketplaceEntries {
  const names: string[] = [];
  const sources = plugins.flatMap((plugin) => {
    const entry = marketplaceEntry.safeParse(plugin);
    if (!entry.success) return [];
    names.push(entry.data.name);
    try {
      return [classifySource(entry.data.source)];
    } catch (error) {
      if (error instanceof ZodError) return [];
      throw error;
    }
  });
  return {
    count: plugins.length,
    sources,
    described: plugins.filter((plugin) => describedEntry.safeParse(plugin).success).length,
    duplicateNames: new Set(names).size < names.length,
  };
}

/** The part's share of the whole to three decimals; an empty whole gives 0. */
export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 1000;
}

export function analyzeMarketplace({ count, sources }: MarketplaceEntries) {
  // Every kind gets a count, zero included.
  const sourceKinds = Object.fromEntries(sourceKind.options.map((kind) => [kind, 0]));
  for (const { kind } of sources) sourceKinds[kind] = (sourceKinds[kind] ?? 0) + 1;
  const pinnedCount = sources.filter(({ pin }) => pinned.has(pin)).length;
  return {
    pluginCount: count,
    sourceKinds,
    pinnedShare: share(pinnedCount, sources.length),
  };
}
