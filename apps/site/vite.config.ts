import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { dataFileContract, indexFile, recordContracts } from '@directory/contracts';
import { lingui } from '@lingui/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const dataFolder = join(import.meta.dirname, 'data/v1');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(dataFolder, path), 'utf8'));
}

/** Parses every data file with its contract at build time, so the bundle ships only valid data and no schema code. */
function validatedData() {
  const paths = readdirSync(dataFolder, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.json'));
  for (const path of paths) {
    const contract = dataFileContract(path.split(sep).join('/'));
    if (contract === undefined) throw new Error(`${path} is not a file of the data layout`);
    contract.parse(readJson(path));
  }
  return indexFile.parse(readJson('index.json'));
}

const index = validatedData();
const kinds = Object.keys(recordContracts);
const pages = [
  '/',
  '/method/',
  ...kinds.map((kind) => `/${kind}/`),
  ...index.items.map((item) => `/${item.kind}/${item.id}/`),
].map((path) => ({ path, prerender: { enabled: true } }));

export default defineConfig({
  // scripts/weight.ts reads the chunk graph from the client manifest.
  environments: { client: { build: { manifest: true } } },
  // The prerender fetches pages from the preview server; `localhost` can resolve to an address it does not listen on.
  preview: { host: '127.0.0.1' },
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
