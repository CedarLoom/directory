import { itemId, mcpServerRecord, metaFile } from '@directory/contracts';
import { z } from 'zod';
import type { Candidate } from './candidate.ts';
import { byCodeUnits } from './code-unit-order.ts';
import type { DataFiles } from './data-files.ts';
import { userAgent } from './github-contents.ts';
import { type GitHubLocation, locationLink, parseRepository, repositoryId } from './github-location.ts';
import { type HttpClient, RequestCapError, RequestError } from './http-client.ts';
import { issueSummary } from './issue-summary.ts';
import { jsonText } from './json-text.ts';
import { analyzeMcpServer, type McpServerFacts, registryServer } from './mcp-server-analyzer.ts';
import type { SourceRead } from './run-report.ts';
import type { SourceAdapter } from './source-adapter.ts';

/** Headers of every MCP Registry request; its read API needs no authorization. */
export const registryHeaders: Readonly<Record<string, string>> = { 'user-agent': userAgent };

// Registry API: https://modelcontextprotocol.io/registry/registry-aggregators
const listUrl = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const pageSize = 100;
// One page of 100 entries is a few hundred KB; the cap only stops a runaway answer.
const maxPageBytes = 8 * 1024 * 1024;
// The next read starts an hour before the last one, so an update at the window's edge is read twice, not lost.
const overlapMs = 3_600_000;
// A share of known servers deleted in one window that only a data reset explains.
const vanishedShare = 0.2;

const official = z.object({
  status: z.enum(['active', 'deprecated', 'deleted']),
  publishedAt: z.iso.datetime({ offset: true }),
});
const entry = z.object({
  server: registryServer,
  _meta: z.object({ 'io.modelcontextprotocol.registry/official': official }),
});
// The name of a refused entry, so an incremental read drops what the last run knew of that server.
const named = z.object({ server: registryServer.pick({ name: true }) });
const page = z.object({
  servers: z.array(z.unknown()),
  // The registry's cursor is `<name>:<version>`, at most 200 + 1 + 255 characters.
  metadata: z.object({ nextCursor: z.string().min(1).max(456).optional() }),
});

/** A registry server as the run keeps it: from this run's registry entry or from the record of the last run. */
interface KnownServer {
  name: string;
  repository?: GitHubLocation;
  facts: McpServerFacts;
}

interface ReadEntry {
  server: KnownServer;
  status: 'active' | 'deprecated' | 'deleted';
  publishedAt: number;
}

const checkpointFile = metaFile.pick({ sources: true }).loose();
const indexIds = z.object({ items: z.array(z.object({ id: z.string(), kind: z.string() })) });
const recordFolder = 'records/mcp-server/';

/** The ids of the MCP server records the last run built, as its `index.json` lists them. */
function indexedServers(previous: DataFiles): Set<string> {
  const index = previous.get('index.json');
  if (index === undefined) return new Set();
  const { items } = indexIds.parse(JSON.parse(index));
  return new Set(items.filter(({ kind }) => kind === 'mcp-server').map(({ id }) => id));
}

/** The checkpoint and the servers of the last run, read from its `meta.json`, `index.json` and MCP server records. */
function lastRun(previous: DataFiles): { checkpoint?: string; known: Map<string, KnownServer> } {
  const meta = previous.get('meta.json');
  const checkpoint =
    meta === undefined
      ? undefined
      : checkpointFile.parse(JSON.parse(meta)).sources.find(({ id }) => id === 'mcp-registry')?.readAt;
  // Only the index names the last run's servers: a folder an older publish wrote still holds the records of dropped ones.
  const indexed = indexedServers(previous);
  const known = new Map<string, KnownServer>();
  for (const [path, text] of previous) {
    if (!path.startsWith(recordFolder) || !indexed.has(path.slice(recordFolder.length, -'.json'.length))) continue;
    const { name, links, version, ...record } = mcpServerRecord.parse(JSON.parse(text));
    const repository = gitHubRepository(name, links.source);
    const facts: McpServerFacts = {
      ...(version === undefined ? {} : { version }),
      registryStatus: record.registryStatus,
      transports: record.transports,
      packageRegistryTypes: record.packageRegistryTypes,
      versionPinned: record.versionPinned,
      requiredSecrets: record.requiredSecrets,
      remoteHosts: record.remoteHosts,
    };
    known.set(name, { name, ...(repository && { repository }), facts });
  }
  return { ...(checkpoint === undefined ? {} : { checkpoint }), known };
}

/**
 * The repository of a registry entry when it is a GitHub repository root, the only place the run reads facts from. Only
 * an `io.github.<account>` namespace, which the registry grants by GitHub login, proves who owns a repository, so a
 * server keeps a repository of that account only; a server in any other namespace counts as without a repository, so
 * it cannot take another repository's stars.
 */
function gitHubRepository(name: string, url: string | undefined): GitHubLocation | undefined {
  // The registry accepts http and www. spellings of a GitHub URL; the link is built from owner and name.
  const path = /^https?:\/\/(?:www\.)?github\.com\/(.*)$/.exec(url ?? '')?.[1];
  const repository = path === undefined ? undefined : parseRepository(path);
  const account = /^io\.github\.([^/]+)\//.exec(name)?.[1];
  if (repository === undefined || account?.toLowerCase() !== repository.owner.toLowerCase()) return undefined;
  return { ...repository, path: '', ref: 'HEAD' };
}

function readEntry(raw: unknown): ReadEntry {
  const { server, _meta } = entry.parse(raw);
  const { status, publishedAt } = _meta['io.modelcontextprotocol.registry/official'];
  const repository = gitHubRepository(server.name, server.repository?.url);
  return {
    server: {
      name: server.name,
      ...(repository && { repository }),
      // A deleted server is dropped before its facts are used.
      facts: analyzeMcpServer(server, status === 'deleted' ? 'active' : status),
    },
    status,
    publishedAt: Date.parse(publishedAt),
  };
}

type Log = (line: string) => void;

/** The registry's client and the run's log; the signal ends the read once the run has failed. */
interface Reader {
  client: HttpClient;
  log: Log;
  signal: AbortSignal;
}

function keepLatest(entries: Map<string, ReadEntry>, read: ReadEntry): void {
  const seen = entries.get(read.server.name);
  if (seen === undefined || read.publishedAt >= seen.publishedAt) entries.set(read.server.name, read);
}

/**
 * Reads every page of one listing and keeps the latest version of each server; an entry the contract refuses is
 * logged by its index and left out, an answer that is no page stops the read. The filters stay the same while
 * following `nextCursor`, as the registry asks.
 */
async function readListing({ client, log, signal }: Reader, filters: Record<string, string>) {
  const entries = new Map<string, ReadEntry>();
  const refusedNames = new Set<string>();
  let refused = 0;
  const listing = `${listUrl}?${new URLSearchParams({ ...filters, limit: String(pageSize) }).toString()}`;
  // Each page needs the cursor of the one before; the client's request cap stops a cursor that never ends.
  const readPage = async (cursor: string | undefined, pageIndex: number): Promise<void> => {
    signal.throwIfAborted();
    const url = cursor === undefined ? listing : `${listing}&${new URLSearchParams({ cursor }).toString()}`;
    // The cursor holds a publisher's version text, so the log and the errors name the page by its index.
    const label = `${listing} (page ${pageIndex})`;
    const text = await client.getText(url, { accept: 'application/json', maxBytes: maxPageBytes, label });
    const answer = jsonText.pipe(page).safeParse(text);
    if (!answer.success) throw new RequestError(`${label}: no page: ${issueSummary(answer.error, 'value')}`);
    const { servers, metadata } = answer.data;
    for (const [index, raw] of servers.entries()) {
      try {
        keepLatest(entries, readEntry(raw));
      } catch (error) {
        if (!(error instanceof z.ZodError)) throw error;
        refused += 1;
        log(`mcp-registry: refused page ${pageIndex} servers[${index}]: ${issueSummary(error, 'value')}`);
        const name = named.safeParse(raw).data?.server.name;
        if (name !== undefined) refusedNames.add(name);
      }
    }
    if (metadata.nextCursor !== undefined) await readPage(metadata.nextCursor, pageIndex + 1);
  };
  await readPage(undefined, 0);
  return { entries: [...entries.values()], refused, refusedNames };
}

/** Why the incremental result cannot be trusted, or undefined when it can. */
function fullCrawlReason(
  entries: readonly ReadEntry[],
  known: ReadonlyMap<string, KnownServer>,
  checkpoint: number,
): SourceRead['reason'] {
  // A name and version are immutable, so a known version published again after the checkpoint means the data was reset.
  const republished = entries.some(
    ({ server, publishedAt }) =>
      server.facts.version !== undefined &&
      known.get(server.name)?.facts.version === server.facts.version &&
      publishedAt > checkpoint,
  );
  if (republished) return 'reset';
  const deleted = entries.filter(({ server, status }) => status === 'deleted' && known.has(server.name)).length;
  return deleted > known.size * vanishedShare ? 'vanished' : undefined;
}

function candidate(server: KnownServer): Candidate {
  // A repository name too long for an id refuses this server here, not the run where the facts are read.
  if (server.repository !== undefined) repositoryId(server.repository);
  const links = { registry: `${listUrl}/${encodeURIComponent(server.name)}/versions/latest` };
  return {
    kind: 'mcp-server',
    id: itemId.parse(server.name.toLowerCase().replace('/', '.')),
    name: server.name,
    links: server.repository === undefined ? links : { source: locationLink(server.repository), ...links },
    ...(server.repository && { location: server.repository }),
    listedIn: [],
    provenance: ['mcp-registry'],
    mcpServer: server.facts,
  };
}

/** The candidates of the servers; a server whose id another server already has is refused, not merged into it. */
function candidates(servers: Iterable<KnownServer>, log: Log) {
  const found = new Map<string, Candidate>();
  let refused = 0;
  // Code unit order, so which of two servers with one id is kept does not depend on the registry's order.
  for (const server of [...servers].toSorted((first, second) => byCodeUnits(first.name, second.name))) {
    try {
      const built = candidate(server);
      if (found.has(built.id)) {
        refused += 1;
        log(`mcp-registry: ${built.id}: refused: another server has this id`);
        continue;
      }
      found.set(built.id, built);
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      refused += 1;
      log(`mcp-registry: refused a server: ${issueSummary(error, 'value')}`);
    }
  }
  return { found: [...found.values()], refused };
}

/** The servers of the last run with the changes since its checkpoint applied, or why the whole registry must be read. */
async function readChanges(
  reader: Reader,
  checkpoint: string,
  known: ReadonlyMap<string, KnownServer>,
): Promise<{ servers: Map<string, KnownServer>; refused: number; reason: SourceRead['reason'] }> {
  const since = new Date(Date.parse(checkpoint) - overlapMs).toISOString();
  const listing = await readListing(reader, { version: 'latest', updated_since: since });
  const servers = new Map(known);
  for (const name of listing.refusedNames) servers.delete(name);
  for (const { server, status } of listing.entries)
    if (status === 'deleted') servers.delete(server.name);
    else servers.set(server.name, server);
  return { servers, refused: listing.refused, reason: fullCrawlReason(listing.entries, known, Date.parse(checkpoint)) };
}

interface ServersRead {
  servers: Map<string, KnownServer>;
  refused: number;
  reason: SourceRead['reason'];
  stopped?: SourceRead['stopped'];
}

/**
 * Reads the changes since the checkpoint, or the whole registry when there is none or the changes look like a reset. A
 * read that stops before its last page keeps the servers of the last run.
 */
async function readServers(
  reader: Reader,
  checkpoint: string | undefined,
  known: ReadonlyMap<string, KnownServer>,
): Promise<ServersRead> {
  let reason: SourceRead['reason'] = checkpoint === undefined || known.size === 0 ? 'no-checkpoint' : undefined;
  try {
    if (checkpoint !== undefined && reason === undefined) {
      const changes = await readChanges(reader, checkpoint, known);
      if (changes.reason === undefined) return changes;
      reason = changes.reason;
    }
    reader.log(`mcp-registry: full crawl (${reason})`);
    const listing = await readListing(reader, { version: 'latest' });
    const kept = listing.entries.filter(({ status }) => status !== 'deleted');
    return { servers: new Map(kept.map(({ server }) => [server.name, server])), refused: listing.refused, reason };
  } catch (error) {
    if (!(error instanceof RequestError)) throw error;
    reader.log(`mcp-registry: stopped, the last run's servers and checkpoint are kept: ${error.message}`);
    const stopped = error instanceof RequestCapError ? 'request-cap' : 'request-error';
    return { servers: new Map(known), refused: 0, reason, stopped };
  }
}

/**
 * The MCP Registry adapter; it reads through its own client, without the GitHub token. With a checkpoint it reads only
 * what changed since and applies that to the servers of the last run; with none, or when the change looks like a data
 * reset, it reads the whole registry. A deleted server is left out. A read that stops before its last page keeps the
 * servers and the checkpoint of the last run, as the registry asks a new checkpoint to follow only a complete read.
 * Once `signal` aborts, no further page is read.
 */
export function mcpRegistryAdapter(previous: DataFiles, runAt: string, signal: AbortSignal): SourceAdapter {
  return {
    id: 'mcp-registry',
    async collect(client, log) {
      const { checkpoint, known } = lastRun(previous);
      const { servers, refused, reason, stopped } = await readServers({ client, log, signal }, checkpoint, known);
      const { found, refused: unnamed } = candidates(servers.values(), log);
      const nextCheckpoint = stopped === undefined ? runAt : checkpoint;
      const read: SourceRead = {
        id: 'mcp-registry',
        ...(nextCheckpoint !== undefined && { readAt: nextCheckpoint }),
        crawl: reason === undefined ? 'incremental' : 'full',
        ...(reason && { reason }),
        ...(stopped && { stopped }),
        withoutRepository: [...servers.values()].filter(({ repository }) => repository === undefined).length,
        requests: client.requests,
      };
      return { candidates: found, refused: refused + unnamed, read };
    },
  };
}
