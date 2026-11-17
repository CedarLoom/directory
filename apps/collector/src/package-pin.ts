/** An image names a tag or digest other than `latest`; the tag follows the last `/`, after any registry port. */
export function imagePinned(identifier: string): boolean {
  const image = identifier.slice(identifier.lastIndexOf('/') + 1);
  return /[:@]/.test(image) && !image.endsWith(':latest');
}

// `name@1.2.3` or `@scope/name@1.2.3`: a range, a tag or a URL resolves to whatever the registry holds at start.
const npmExact = /^(?:@[^@/\s]+\/)?[^@/\s]+@v?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
// `name==1.2.3` or `name@1.2.3`, extras allowed; `latest`, a URL, a wildcard or a second specifier is not one version.
const uvExact = /^[\w.-]+(?:\[[\w.,-]*\])?(?:==|@)v?\d[\w.!+-]*$/;

/**
 * What an option names: the package to run (the first argument is then a command inside it), a further package to
 * install, a value of another kind, or nothing (a flag).
 */
type Role = 'source' | 'extra' | 'value' | 'flag';

interface Runner {
  options: ReadonlyMap<string, Role>;
  pinned: (reference: string) => boolean;
}

function roles(
  source: readonly string[],
  extra: readonly string[],
  value: readonly string[],
  flag: readonly string[],
): Map<string, Role> {
  return new Map([
    ...source.map((name) => [name, 'source'] as const),
    ...extra.map((name) => [name, 'extra'] as const),
    ...value.map((name) => [name, 'value'] as const),
    ...flag.map((name) => [name, 'flag'] as const),
  ]);
}

// npx and the runners that fetch from the npm registry under other names share one option table.
const npm: Runner = {
  options: roles(
    ['-p', '--package'],
    [],
    ['-c', '--call', '--registry', '--cache', '--prefix', '--userconfig', '-w', '--workspace', '--cwd'],
    [
      '-y',
      '--yes',
      '--no',
      '-q',
      '--quiet',
      '-s',
      '--silent',
      '--prefer-offline',
      '--prefer-online',
      '--offline',
      '--bun',
    ],
  ),
  pinned: (reference: string) => npmExact.test(reference),
};

// In pnpm, `-c` is the shell mode flag, where npx reads a command string after it.
const pnpm: Runner = {
  ...npm,
  options: new Map([...npm.options, ['-c', 'flag'], ['--shell-mode', 'flag']]),
};

const uv: Runner = {
  options: roles(
    ['--from'],
    ['--with'],
    ['-p', '--python', '--index', '--default-index', '--index-url', '--extra-index-url', '--directory'],
    ['-q', '--quiet', '-v', '--verbose', '-n', '--no-cache', '--offline', '--isolated', '--refresh', '--no-progress'],
  ),
  pinned: (reference: string) => uvExact.test(reference),
};

const pipx: Runner = {
  options: roles(['--spec'], [], ['--python', '--pip-args', '--index-url'], ['-q', '--quiet', '-v', '--verbose']),
  pinned: (reference: string) => uvExact.test(reference),
};

const container: Runner = {
  options: roles(
    [],
    [],
    [
      '-e',
      '--env',
      '--env-file',
      '-v',
      '--volume',
      '--mount',
      '-p',
      '--publish',
      '--name',
      '--network',
      '-w',
      '--workdir',
      '-u',
      '--user',
      '--entrypoint',
      '--platform',
      '-l',
      '--label',
      '--pull',
      '-h',
      '--hostname',
      '--add-host',
      '--cap-add',
      '--cap-drop',
      '--security-opt',
      '-m',
      '--memory',
      '--cpus',
    ],
    ['-i', '--interactive', '-t', '--tty', '-d', '--detach', '--rm', '--init', '--read-only'],
  ),
  pinned: imagePinned,
};

// A command, the subcommand words before its arguments, and its runner; a more specific entry comes first.
const commands: readonly (readonly [string, readonly string[], Runner])[] = [
  ['npx', [], npm],
  ['bunx', [], npm],
  ['bun', ['x'], npm],
  ['npm', ['exec'], npm],
  ['npm', ['x'], npm],
  ['pnpx', [], pnpm],
  ['pnpm', ['dlx'], pnpm],
  ['yarn', ['dlx'], npm],
  ['uvx', [], uv],
  ['uv', ['tool', 'run'], uv],
  ['pipx', ['run'], pipx],
  ['docker', ['run'], container],
  ['docker', [], container],
  ['podman', ['run'], container],
  ['podman', [], container],
];

const isOption = (arg: string | undefined): boolean => arg !== undefined && arg !== '--' && arg.startsWith('-');

/** `-it`: single-letter flags given together. */
function flagCluster(options: ReadonlyMap<string, Role>, name: string): boolean {
  return (
    /^-[A-Za-z]{2,}$/.test(name) && Array.from(name.slice(1)).every((letter) => options.get(`-${letter}`) === 'flag')
  );
}

interface Option {
  role: Role | undefined;
  value: string | undefined;
  next: number;
}

/** The option at `index`: its role, the value it carries after `=` or as the next argument, and where the rest starts. */
function optionAt(options: ReadonlyMap<string, Role>, args: readonly string[], index: number): Option {
  const arg = args[index] ?? '';
  const equals = arg.indexOf('=');
  const name = equals === -1 ? arg : arg.slice(0, equals);
  const role = options.get(name) ?? (flagCluster(options, name) ? 'flag' : undefined);
  if (equals !== -1) return { role, value: arg.slice(equals + 1), next: index + 1 };
  return role === undefined || role === 'flag'
    ? { role, value: undefined, next: index + 1 }
    : { role, value: args[index + 1], next: index + 2 };
}

/**
 * The packages a runner fetches: those its options name, and the first argument unless a source option named the
 * package. None when an option is unknown, as it may take the next argument as its value.
 */
function fetched({ options }: Runner, args: readonly string[]): string[] {
  const packages: string[] = [];
  let named = false;
  let index = 0;
  while (isOption(args[index])) {
    const { role, value, next } = optionAt(options, args, index);
    if (role === undefined) return [];
    if (role === 'source' || role === 'extra') packages.push(value ?? '');
    named ||= role === 'source';
    index = next;
  }
  const first = args[index] === '--' ? args[index + 1] : args[index];
  return named || first === undefined ? packages : [...packages, first];
}

/**
 * The arguments without the subcommand words, each of which may follow options of the runner; undefined when the
 * command names another subcommand. Behind an unknown option the words stay, and `fetched` then finds no package.
 */
function withoutWords(
  { options }: Runner,
  words: readonly string[],
  args: readonly string[],
): readonly string[] | undefined {
  const rest = [...args];
  let index = 0;
  for (const word of words) {
    while (isOption(rest[index])) {
      const { role, next } = optionAt(options, rest, index);
      if (role === undefined) return args;
      index = next;
    }
    if (rest[index] !== word) return undefined;
    rest.splice(index, 1);
  }
  return rest;
}

/** The program a command names; on Windows that is `npx.cmd` or `NPX.EXE`, behind a path with backslashes. */
function program(command: string): string {
  return command
    .replace(/^.*[/\\]/, '')
    .replace(/\.(?:cmd|exe)$/i, '')
    .toLowerCase();
}

/**
 * Whether a stdio server's command fetches a package at start without naming its exact version.
 * An unknown command runs local code and fetches nothing; a runner whose package cannot be found counts as unpinned.
 */
export function unpinnedPackage(command: string, args: readonly string[]): boolean {
  // `cmd /c npx` starts the runner on Windows; a second `cmd` inside it is not followed.
  const inner = program(command) === 'cmd' && args[0]?.toLowerCase() === '/c' ? args[1] : undefined;
  const name = program(inner ?? command);
  const own = inner === undefined ? args : args.slice(2);
  for (const [known, words, runner] of commands) {
    const rest = known === name ? withoutWords(runner, words, own) : undefined;
    if (rest === undefined) continue;
    const packages = fetched(runner, rest);
    return packages.length === 0 || !packages.every(runner.pinned);
  }
  return false;
}
