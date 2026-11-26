import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError, InvalidArgumentError } from '@commander-js/extra-typings';
import { itemId, kind } from '@directory/contracts';
import { ZodError } from 'zod';
import { systemClock } from './clock.ts';
import { collect, summaryLine } from './collect.ts';
import { commitDataFolder } from './data-commit.ts';
import { readDataFile, readDataFolder, updateDataFolder, writeDataFolder } from './data-folder.ts';
import { ExclusionsKeyError, exclusionEntry, exclusionsKeyVariable, parseExclusions } from './exclusions.ts';
import { gitHubHeaders } from './github-contents.ts';
import { createHttpClient, RequestError } from './http-client.ts';
import { registryHeaders } from './mcp-registry-adapter.ts';
import { publication } from './publication.ts';
import { readRubricFiles } from './rubric-files.ts';
import { runReport } from './run-report.ts';
import { sourceAdapters } from './sources.ts';
import { topics } from './topic-search.ts';
import { checkRun } from './validation.ts';

const defaultExclusions = fileURLToPath(new URL('../../../curation/exclusions.json', import.meta.url));
const rubricsFolder = fileURLToPath(new URL('../../../rubrics', import.meta.url));
const dataLicense = fileURLToPath(new URL('../../../LICENSE', import.meta.url));
// A hard cap well under the 1,000 requests per hour of the workflow token; repository facts take one request per 50 registry servers.
const requestCap = 600;
// GitHub's secondary limit allows 900 REST points per minute; one request per second stays far below it.
const requestIntervalMs = 1000;
// A full crawl reads 100 servers a page, and 200 pages reached only names starting with `dev.`: 2,000 pages leave room
// for the whole registry and its growth, at one request a second, and still stop a cursor that never ends.
const registryRequestCap = 2000;

/** sysexits codes: usage 64, bad data 65, missing input 66, internal error 70; 1 when a source stopped the run. */
function exitCode(error: unknown): number {
  if (error instanceof CommanderError) return error.exitCode === 0 ? 0 : 64;
  if (error instanceof ExclusionsKeyError) return 64;
  if (error instanceof ZodError || error instanceof SyntaxError) return 65;
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 66;
  return error instanceof RequestError ? 1 : 70;
}

const log = (line: string) => console.error(line);

const exclusionsKey = () => process.env[exclusionsKeyVariable] ?? '';

async function readExclusions(file: string) {
  return parseExclusions(await readFile(file, 'utf8'), exclusionsKey());
}

async function readReport(file: string) {
  return runReport.parse(JSON.parse(await readFile(file, 'utf8')));
}

/** An item id as given, untrimmed: a trailing newline or an address would hash to an entry that matches nothing. */
function exclusionId(value: string): string {
  if (!itemId.safeParse(value).success) throw new InvalidArgumentError('not an item id');
  return value;
}

/** Adds the kinds of one `--allow-removals` value, a comma list, to those of the earlier ones. */
function allowedKinds(value: string, previous: readonly string[]): string[] {
  return [
    ...previous,
    ...value.split(',').map((part) => {
      const parsed = kind.safeParse(part.trim());
      if (!parsed.success) throw new InvalidArgumentError(`not a kind; one of ${kind.options.join(', ')}`);
      return parsed.data;
    }),
  ];
}

const program = new Command()
  .name('refresh')
  .description('The steps of the scheduled refresh: collect, validate and publish; and the hash of a new exclusion.')
  .exitOverride();

program
  .command('hash-exclusion')
  .description(
    `Prints the hash of an item id as curation/exclusions.json holds it and the keyCheck, both under ${exclusionsKeyVariable}.`,
  )
  // Copied, not composed: ids escape `_`, `.` and `/` in owner, repository and path, as `_5f`, `_2e` and `_2f`.
  .argument(
    '<id>',
    'the id of the item, container or repository to exclude, exactly as its record holds it',
    exclusionId,
  )
  .option('--exclusions <file>', 'the exclusions file whose keyCheck the key must match', defaultExclusions)
  .action(async (id, { exclusions }) => {
    // The key checks of collect and publish: under another key the hash would match nothing.
    await readExclusions(exclusions);
    const entry = exclusionEntry(id, exclusionsKey());
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
  });

program
  .command('collect')
  .description(
    'Reads the sources, the MCP Registry and GitHub, builds the records of every kind and prints the run report.',
  )
  .option('--dry-run', 'print the run report as JSON and write nothing')
  .option('--out <folder>', 'writes every data file of the run into this folder')
  .option(
    '--previous <folder>',
    'the published data folder: the run keeps the bytes of unchanged files and the checkpoints',
  )
  .option('--exclusions <file>', 'the exclusions file', defaultExclusions)
  .action(async ({ dryRun, out, previous: previousFolder, exclusions }) => {
    if ((dryRun === true) === (out !== undefined)) program.error('collect: pass either --dry-run or --out <folder>');
    // Without the published folder, every score history and popularity file would start over.
    if (out !== undefined && previousFolder === undefined) program.error('collect: --out needs --previous <folder>');
    const token = process.env['GITHUB_TOKEN'] ?? '';
    // GitHub's GraphQL API refuses anonymous requests.
    if (token === '') program.error('collect: set GITHUB_TOKEN');
    const excluded = await readExclusions(exclusions);
    const previous = previousFolder === undefined ? new Map<string, string>() : await readDataFolder(previousFolder);
    const limits = {
      fetch,
      clock: systemClock,
      intervalMs: requestIntervalMs,
      maxRetries: 3,
      maxDelayMs: 5 * 60_000,
      log,
    };
    const client = createHttpClient({ ...limits, headers: gitHubHeaders(token), cap: requestCap });
    // The registry gets its own client, so the GitHub token never leaves for another host.
    const registryClient = createHttpClient({ ...limits, headers: registryHeaders, cap: registryRequestCap });
    const { report, files } = await collect(client, {
      adapters: sourceAdapters,
      registryClient,
      topics,
      excluded,
      previous,
      runAt: new Date(systemClock.now()).toISOString(),
      log,
    });
    if (out !== undefined) {
      await writeDataFolder(out, files);
      log(`collect: wrote ${files.size} files to ${out}`);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    log(summaryLine(report));
  });

program
  .command('validate')
  .description(
    'Checks the data files of a run against their contracts and size caps, the published items and the rubric lock.',
  )
  .requiredOption('--candidate <folder>', 'the data folder `collect --out` wrote')
  .requiredOption('--report <file>', 'the run report `collect` printed')
  .requiredOption('--published <folder>', 'the published data folder of the last run')
  .option(
    '--allow-removals <kinds>',
    'accepts a run that lost more than 20 percent of the published items of these kinds, for an intended removal; repeatable or a comma list',
    allowedKinds,
    [],
  )
  .action(async ({ candidate, report: reportFile, published, allowRemovals }) => {
    const report = await readReport(reportFile);
    const [candidateFiles, publishedIndex, { rubrics, lock }] = await Promise.all([
      readDataFolder(candidate),
      readDataFile(published, 'index.json'),
      readRubricFiles(rubricsFolder),
    ]);
    const { refused, accepted } = checkRun({
      candidate: candidateFiles,
      reportedItems: report.items,
      publishedIndex,
      allowRemovals: new Set(allowRemovals),
      rubrics,
      lock,
    });
    for (const line of accepted) log(`validate: accepted: ${line}`);
    for (const refusal of refused) log(`validate: refused: ${refusal}`);
    if (refused.length > 0) {
      process.exitCode = 65;
      return;
    }
    log(`validate: ${candidateFiles.size} files hold`);
  });

program
  .command('publish')
  .description(
    'Writes the changed files of a validated run, meta.json, departures.json and LICENSE into the published data folder, removes the files of items that left or are excluded and the kept files past their retention period, and commits them.',
  )
  .requiredOption('--candidate <folder>', 'the data folder of the validated run')
  .requiredOption('--report <file>', 'the run report `collect` printed')
  .requiredOption('--data <folder>', 'the published data folder, inside a git work tree of the data branch')
  .option('--exclusions <file>', 'the exclusions file', defaultExclusions)
  .action(async ({ candidate, report: reportFile, data, exclusions }) => {
    const report = await readReport(reportFile);
    const [candidateFiles, published, excluded, license] = await Promise.all([
      readDataFolder(candidate),
      readDataFolder(data),
      readExclusions(exclusions),
      readFile(dataLicense, 'utf8'),
    ]);
    if (!candidateFiles.has('index.json')) program.error(`publish: ${candidate} holds no index.json`);
    const { files, removed } = publication(candidateFiles, published, report, { excluded, license });
    await updateDataFolder(data, files, removed);
    // Also commits what an earlier publish wrote but failed to commit.
    const committed = await commitDataFolder(data, `chore(data): refresh of ${report.runAt}`);
    log(
      `publish: ${files.size} changed files, ${removed.length} removed${committed ? ', committed' : ', nothing to commit'}`,
    );
  });

try {
  await program.parseAsync();
} catch (error) {
  process.exitCode = exitCode(error);
  // Commander has printed its own message; a key error is a setup mistake, so its message is enough.
  if (error instanceof ExclusionsKeyError) console.error(error.message);
  else if (!(error instanceof CommanderError)) console.error(error);
}
