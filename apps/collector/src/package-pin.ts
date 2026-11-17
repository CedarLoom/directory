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
  /** The first argument is a local script or command, so only the options name packages. */
  localFirst?: true;
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

// `uv run` starts local code and installs what `--with` names next to it.
const uvRun: Runner = {
  ...uv,
  options: new Map([
    ...uv.options,
    ['--project', 'value'],
    ['--with-editable', 'value'],
    ['--env-file', 'value'],
    ['-m', 'flag'],
    ['--module', 'flag'],
    ['--script', 'flag'],
    ['--no-project', 'flag'],
    ['--frozen', 'flag'],
    ['--locked', 'flag'],
    ['--no-sync', 'flag'],
  ]),
  localFirst: true,
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
  ['uv', ['run'], uvRun],
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
 * package or the runner starts local code. Undefined when an option is unknown, as it may take the next argument as
 * its value.
 */
function fetched({ options, localFirst }: Runner, args: readonly string[]): string[] | undefined {
  const packages: string[] = [];
  let named = localFirst === true;
  let index = 0;
  while (isOption(args[index])) {
    const { role, value, next } = optionAt(options, args, index);
    if (role === undefined) return undefined;
    if (role === 'source' || role === 'extra') packages.push(value ?? '');
    named ||= role === 'source';
    index = next;
  }
  const first = args[index] === '--' ? args[index + 1] : args[index];
  return named || first === undefined ? packages : [...packages, first];
}

/**
 * The arguments without the subcommand words, each of which may follow options of the runner: `other` when the
 * command names another subcommand, `unreadable` when an unknown option comes before a word that follows later.
 */
function withoutWords(
  { options }: Runner,
  words: readonly string[],
  args: readonly string[],
): readonly string[] | 'other' | 'unreadable' {
  const rest = [...args];
  let index = 0;
  for (const word of words) {
    while (isOption(rest[index])) {
      const { role, next } = optionAt(options, rest, index);
      // Without the word later on, the command names another subcommand, such as `bun --hot server.ts`.
      if (role === undefined) return rest.includes(word, index + 1) ? 'unreadable' : 'other';
      index = next;
    }
    if (rest[index] !== word) return 'other';
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

// The characters a POSIX shell reads literally, as Python's `shlex.quote` leaves them; cmd also reads `\` literally.
const shellPlain = /^[\w@%+=:,./-]+$/;
const cmdPlain = /^[\w@+=:,./\\-]+$/;
const assignment = /^[A-Za-z_]\w*=/;
const envOptions = roles([], [], ['-u', '--unset', '-C', '--chdir'], ['-i', '--ignore-environment']);

/** The words of a command line of plain words between spaces; undefined when it holds anything a shell would read. */
function plainWords(line: string, plain: RegExp): string[] | undefined {
  const words = line.split(/[ \t]+/).filter((word) => word !== '');
  return words.every((word) => plain.test(word)) ? words : undefined;
}

/** The command after the leading `NAME=value` assignments. */
function withoutAssignments(words: readonly string[]): readonly string[] {
  const start = words.findIndex((word) => !assignment.test(word));
  return start === -1 ? [] : words.slice(start);
}

/** `cmd /c` or `/k`, after switches such as `/d` and `/s`, runs the rest as one command line. */
function cmdCommand(words: readonly string[]): readonly string[] | undefined {
  const args = words.slice(1);
  const run = args.findIndex((arg) => !arg.startsWith('/') || /^\/[ck]$/i.test(arg));
  if (!/^\/[ck]$/i.test(args[run] ?? '')) return words;
  const line = plainWords(args.slice(run + 1).join(' '), cmdPlain);
  return line === undefined ? undefined : unwrapped(line);
}

const commandOption = (arg: string): boolean => /^-[A-Za-z]*c/.test(arg);

/** `sh -c` and `bash -c` run their first operand as a command line; without `-c` they run a local script. */
function shellCommand(words: readonly string[]): readonly string[] | undefined {
  const args = words.slice(1);
  const end = args.findIndex((arg) => arg === '--' || !/^[-+]./.test(arg));
  const options = end === -1 ? args : args.slice(0, end);
  // `-o` and `-O` take a value, and a long option may as well, so where the options end is not known.
  if (!options.every((option) => /^-[A-NP-Za-np-z]+$/.test(option)))
    return args.some(commandOption) ? undefined : words;
  if (!options.some(commandOption)) return words;
  const line = args[options.length] === '--' ? args[options.length + 1] : args[options.length];
  const plain = plainWords(line ?? '', shellPlain);
  return plain === undefined ? undefined : unwrapped(withoutAssignments(plain));
}

/** `env` runs the command after its options and assignments. */
function envCommand(words: readonly string[]): readonly string[] | undefined {
  const args = words.slice(1);
  let index = 0;
  while (isOption(args[index])) {
    const { role, next } = optionAt(envOptions, args, index);
    if (role === undefined) return undefined;
    index = next;
  }
  return unwrapped(withoutAssignments(args.slice(args[index] === '--' ? index + 1 : index)));
}

const wrappers: ReadonlyMap<string, (words: readonly string[]) => readonly string[] | undefined> = new Map([
  ['cmd', cmdCommand],
  ['sh', shellCommand],
  ['bash', shellCommand],
  ['env', envCommand],
]);

/** The command and arguments a shell wrapper starts, through nested wrappers; undefined when they cannot be read. */
function unwrapped(words: readonly string[]): readonly string[] | undefined {
  const unwrap = wrappers.get(program(words[0] ?? ''));
  return unwrap === undefined ? words : unwrap(words);
}

/**
 * Whether a stdio server's command fetches a package at start without naming its exact version.
 * An unknown command runs local code and fetches nothing; a runner whose package cannot be found, and a shell
 * wrapper whose command cannot be read, count as unpinned.
 */
export function unpinnedPackage(command: string, args: readonly string[]): boolean {
  const words = unwrapped([command, ...args]);
  if (words === undefined) return true;
  const [inner = '', ...own] = words;
  const name = program(inner);
  for (const [known, subcommand, runner] of commands) {
    const rest = known === name ? withoutWords(runner, subcommand, own) : 'other';
    if (rest === 'other') continue;
    const packages = rest === 'unreadable' ? undefined : fetched(runner, rest);
    if (packages === undefined) return true;
    return packages.length === 0 ? runner.localFirst !== true : !packages.every(runner.pinned);
  }
  return false;
}
