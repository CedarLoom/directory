import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from '@commander-js/extra-typings';
import { ZodError } from 'zod';
import { systemClock } from './clock.ts';
import { collect, summaryLine } from './collect.ts';
import { readDataFolder, writeDataFolder } from './data-folder.ts';
import { parseExclusions } from './exclusions.ts';
import { gitHubHeaders } from './github-contents.ts';
import { createHttpClient, RequestError } from './http-client.ts';
import { sourceAdapters } from './sources.ts';
import { topics } from './topic-search.ts';

const defaultExclusions = fileURLToPath(new URL('../../../curation/exclusions.json', import.meta.url));
// A hard cap well under the 1,000 requests per hour of the workflow token; a run takes about 100.
const requestCap = 600;
// GitHub's secondary limit allows 900 REST points per minute; one request per second stays far below it.
const requestIntervalMs = 1000;

/** sysexits codes: usage 64, bad data 65, missing input 66, internal error 70; 1 when a source stopped the run. */
function exitCode(error: unknown): number {
  if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 64;
  if (error instanceof ZodError || error instanceof SyntaxError) return 65;
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 66;
  return error instanceof RequestError ? 1 : 70;
}

const log = (line: string) => console.error(line);

const program = new Command()
  .name('collect')
  .description(
    'Reads the sources and GitHub, builds the marketplace, plugin, skill and agent records and prints the run report.',
  )
  .option('--dry-run', 'print the run report as JSON and write nothing')
  .option('--out <folder>', 'the data folder: reads the last run there and writes the changed files')
  .option('--exclusions <file>', 'the exclusions file', defaultExclusions)
  .exitOverride()
  .action(async ({ dryRun, out, exclusions }) => {
    if ((dryRun === true) === (out !== undefined)) program.error('collect: pass either --dry-run or --out <folder>');
    const excluded = parseExclusions(await readFile(exclusions, 'utf8'));
    const previous = out === undefined ? new Map<string, string>() : await readDataFolder(out);
    const client = createHttpClient({
      fetch,
      clock: systemClock,
      headers: gitHubHeaders(process.env['GITHUB_TOKEN'] || undefined),
      cap: requestCap,
      intervalMs: requestIntervalMs,
      maxRetries: 3,
      maxDelayMs: 5 * 60_000,
      log,
    });
    const runDate = new Date(systemClock.now()).toISOString().slice(0, 10);
    const { report, files } = await collect(client, {
      adapters: sourceAdapters,
      topics,
      excluded,
      previous,
      runDate,
      log,
    });
    if (out !== undefined) log(`collect: wrote ${await writeDataFolder(out, files, previous)} changed files to ${out}`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    log(summaryLine(report));
  });

try {
  await program.parseAsync();
} catch (error) {
  process.exitCode = exitCode(error);
  // Commander has printed its own message.
  if (!(error instanceof CommanderError)) console.error(error);
}
