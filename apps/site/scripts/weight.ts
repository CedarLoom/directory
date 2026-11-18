import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

interface Chunk {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
}

interface Budget {
  readonly sharedKb: number;
  readonly routes: Readonly<Record<string, { readonly chunks: readonly string[]; readonly capKb: number }>>;
  readonly dataChunkKb: number;
  readonly artifactMb: number;
}

const site = join(import.meta.dirname, '../');
const client = join(site, 'dist/client');
const manifest: Record<string, Chunk> = JSON.parse(readFileSync(join(client, '.vite/manifest.json'), 'utf8'));
const budget: Budget = JSON.parse(readFileSync(join(site, 'weight-budget.json'), 'utf8'));
// Records, score histories, popularity files and rubric versions each build into one chunk a route loads on demand.
const dataChunk = /^(data\/v1\/(records|history|popularity)|\.\.\/\.\.\/rubrics)\//;

function gzipBytes(file: string): number {
  return gzipSync(readFileSync(join(client, file))).length;
}

/** The manifest keys of a chunk and everything it imports statically. */
function closure(key: string, seen = new Set<string>()): Set<string> {
  const chunk = manifest[key];
  if (chunk === undefined) throw new Error(`The manifest has no chunk ${key}`);
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const imported of chunk.imports ?? []) closure(imported, seen);
  return seen;
}

function chunksKb(keys: Iterable<string>): number {
  let total = 0;
  for (const key of keys) total += gzipBytes(manifest[key]?.file ?? key);
  return total / 1000;
}

const entry = Object.keys(manifest).find((key) => manifest[key]?.isEntry === true);
if (entry === undefined) throw new Error('The manifest has no entry chunk');
const shared = closure(entry);
const failures: string[] = [];

function report(name: string, value: number, cap: number, unit: string): void {
  console.log(`${name}: ${value.toFixed(1)} ${unit} of ${cap} ${unit}`);
  if (value > cap) failures.push(name);
}

report('shared by every page', chunksKb(shared), budget.sharedKb, 'kB gzip');
for (const [route, { chunks, capKb }] of Object.entries(budget.routes)) {
  const own = new Set<string>();
  for (const chunk of chunks.flatMap((key) => Array.from(closure(key)))) if (!shared.has(chunk)) own.add(chunk);
  report(`${route} route`, chunksKb(own), capKb, 'kB gzip');
}
const data = Object.keys(manifest).filter((key) => dataChunk.test(key));
if (data.length === 0) throw new Error('The manifest has no data chunks; has their path changed?');
const largest = Math.max(...data.map((key) => chunksKb([key])));
report(`largest of ${data.length} data chunks`, largest, budget.dataChunkKb, 'kB gzip');
// GitHub Pages limits a published site by its unpacked size, so the artifact counts raw bytes, not gzip.
const files = readdirSync(client, { recursive: true, encoding: 'utf8' }).filter((file) =>
  statSync(join(client, file)).isFile(),
);
const rawMb = files.reduce((total, file) => total + statSync(join(client, file)).size, 0) / 1e6;
report(`artifact of ${files.length} files`, rawMb, budget.artifactMb, 'MB unpacked');

if (failures.length > 0) throw new Error(`Over budget: ${failures.join(', ')}`);
