import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentRecord,
  historyFile,
  hookRecord,
  indexFile,
  marketplaceRecord,
  mcpServerRecord,
  metaFile,
  outputStyleRecord,
  pluginRecord,
  popularityFile,
  skillRecord,
} from '@directory/contracts';
import { lingui } from '@lingui/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const dataFolder = join(import.meta.dirname, 'data/v1');

const recordSchemas = {
  marketplace: marketplaceRecord,
  plugin: pluginRecord,
  skill: skillRecord,
  agent: agentRecord,
  hook: hookRecord,
  'mcp-server': mcpServerRecord,
  'output-style': outputStyleRecord,
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(dataFolder, path), 'utf8'));
}

function jsonFiles(folder: string): string[] {
  return readdirSync(join(dataFolder, folder), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.json'))
    .map((path) => `${folder}/${path}`);
}

const recordSchemaOf = new Map(Object.entries(recordSchemas));

/** Parses every data file with its contract at build time, so the bundle ships only valid data and no schema code. */
function validatedData() {
  const index = indexFile.parse(readJson('index.json'));
  metaFile.parse(readJson('meta.json'));
  for (const path of jsonFiles('records')) {
    const schema = recordSchemaOf.get(path.split('/')[1] ?? '');
    if (schema === undefined) throw new Error(`${path} is in no kind folder`);
    schema.parse(readJson(path));
  }
  for (const path of jsonFiles('history')) historyFile.parse(readJson(path));
  for (const path of jsonFiles('popularity')) popularityFile.parse(readJson(path));
  return index;
}

const index = validatedData();
const kinds = Object.keys(recordSchemas);
const pages = [
  '/',
  '/method/',
  ...kinds.map((kind) => `/${kind}/`),
  ...index.items.map((item) => `/${item.kind}/${item.id}/`),
].map((path) => ({ path, prerender: { enabled: true } }));

export default defineConfig({
  // scripts/weight.ts reads the chunk graph from the client manifest.
  environments: { client: { build: { manifest: true } } },
  plugins: [
    tanstackStart({
      // The shell needs a path of its own: the prerender skips a second page at `/`.
      spa: { enabled: true, maskPath: '/_shell/', prerender: { outputPath: '/404', crawlLinks: false } },
      prerender: { enabled: true, crawlLinks: false, autoStaticPathsDiscovery: false, failOnError: true },
      pages,
      router: { addExtensions: true },
    }),
    viteReact(),
    lingui({ configPath: join(import.meta.dirname, 'lingui.config.ts'), failOnMissing: true, macroTransform: true }),
  ],
});
