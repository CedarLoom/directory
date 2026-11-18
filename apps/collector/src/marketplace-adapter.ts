import {
  classifySource,
  httpsUrl,
  itemName,
  marketplaceEntry,
  marketplaceFile,
  type SourceId,
} from '@directory/contracts';
import { ZodError } from 'zod';
import type { Candidate } from './candidate.ts';
import { readRepositoryFile, type Repository } from './github-contents.ts';
import {
  entryNameId,
  type GitHubLocation,
  joinPath,
  locateSource,
  locationId,
  locationLink,
  repositoryId,
} from './github-location.ts';
import type { HttpClient } from './http-client.ts';
import { issueSummary } from './issue-summary.ts';
import { jsonText } from './json-text.ts';
import { entrySources } from './marketplace-analyzer.ts';
import { licenseField } from './plugin-analyzer.ts';
import type { SourceAdapter, SourceResult } from './source-adapter.ts';

const marketplacePath = '.claude-plugin/marketplace.json';
// The largest file read, the community marketplace, has about 1.6 MB.
const marketplaceMaxBytes = 8 * 1024 * 1024;

interface Listing {
  source: SourceId;
  marketplace: GitHubLocation;
  marketplaceId: string;
}

function skillCandidate(location: GitHubLocation, container: string, listing: Listing): Candidate {
  return {
    kind: 'skill',
    id: locationId(location),
    name: itemName.parse(location.path.split('/').at(-1)),
    links: { source: locationLink(location) },
    location,
    container,
    listedIn: [listing.marketplaceId],
    provenance: [listing.source],
  };
}

/**
 * The license field of an entry whose plugin sits in the marketplace's own repository; for another repository's plugin
 * the marketplace may hold no rights to grant one.
 */
function ownLicense(value: unknown, location: GitHubLocation | undefined, listing: Listing): string | undefined {
  const own = location !== undefined && repositoryId(location) === repositoryId(listing.marketplace);
  return own ? licenseField(value) : undefined;
}

/** The plugin of one entry and the skills it lists; a plugin without a location of its own is identified by its name. */
function entryCandidates(raw: unknown, listing: Listing): Candidate[] {
  const entry = marketplaceEntry.parse(raw);
  const source = classifySource(entry.source);
  const location = locateSource(entry.source, source.kind, listing.marketplace);
  const located = location !== undefined && locationId(location) !== listing.marketplaceId;
  const id = located ? locationId(location) : entryNameId(listing.marketplace, entry.name);
  // A homepage off the allow-listed hosts is not stored.
  const homepage = httpsUrl.safeParse(entry.homepage);
  const license = ownLicense(entry.license, location, listing);
  const plugin: Candidate = {
    kind: 'plugin',
    id,
    name: entry.name,
    links: {
      ...(location === undefined ? {} : { source: locationLink(location) }),
      ...(homepage.success ? { homepage: homepage.data } : {}),
    },
    ...(location === undefined ? {} : { location }),
    listedIn: [listing.marketplaceId],
    provenance: [listing.source],
    source,
    ...(license === undefined ? {} : { entryLicense: license }),
  };
  const skills =
    location === undefined
      ? []
      : (entry.skills ?? []).map((path) =>
          skillCandidate({ ...location, path: joinPath(location.path, path) }, id, listing),
        );
  return [plugin, ...skills];
}

async function readMarketplace(
  client: HttpClient,
  repository: Repository,
  source: SourceId,
  log: (line: string) => void,
): Promise<SourceResult> {
  const text = await readRepositoryFile(client, repository, marketplacePath, marketplaceMaxBytes);
  const marketplace = { ...repository, path: '', ref: 'HEAD' };
  const listing = { source, marketplace, marketplaceId: locationId(marketplace) };
  const file = jsonText.pipe(marketplaceFile).parse(text);
  const candidates: Candidate[] = [
    {
      kind: 'marketplace',
      id: listing.marketplaceId,
      name: file.name,
      links: { source: locationLink(marketplace) },
      location: marketplace,
      listedIn: [],
      provenance: [source],
      entries: entrySources(file.plugins),
    },
  ];
  let refused = 0;
  for (const [index, raw] of file.plugins.entries()) {
    try {
      candidates.push(...entryCandidates(raw, listing));
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      refused += 1;
      log(`${listing.marketplaceId}: refused plugins[${index}]: ${issueSummary(error, 'entry')}`);
    }
  }
  return { candidates, refused };
}

/** An adapter that reads the marketplace file of each repository. */
export function marketplaceAdapter(id: SourceId, repositories: readonly Repository[]): SourceAdapter {
  return {
    id,
    async collect(client, log) {
      const results = await Promise.all(repositories.map((repository) => readMarketplace(client, repository, id, log)));
      return {
        candidates: results.flatMap((result) => result.candidates),
        refused: results.reduce((sum, result) => sum + result.refused, 0),
      };
    },
  };
}
