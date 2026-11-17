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
  /** The first argument is a local script or command unless it is a URL, so only the options name packages. */
  localFirst?: true;
  /** A short option takes its value attached, as in `-wrequests`. */
  attachedValues?: true;
}

/** What reads the options of a command. */
type Parser = Pick<Runner, 'options' | 'attachedValues'>;

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
  attachedValues: true,
};

// `uv run` starts local code and installs what `--with` names next to it: the options of `uv run --help`, and the
// aliases and hidden options it accepts with a value.
const uvRun: Runner = {
  options: roles(
    [],
    ['-w', '--with'],
    [
      '--extra',
      '--no-extra',
      '--group',
      '--no-group',
      '--only-group',
      '--no-editable-package',
      '--env-file',
      '--with-editable',
      '--with-requirements',
      '--package',
      '--python-platform',
      '--index',
      '--default-index',
      '-i',
      '--index-url',
      '--extra-index-url',
      '-f',
      '--find-links',
      '--index-strategy',
      '--keyring-provider',
      '-P',
      '--upgrade-package',
      '--upgrade-group',
      '--resolution',
      '--prerelease',
      '--prerelease-package',
      '--fork-strategy',
      '--exclude-newer',
      '--exclude-newer-package',
      '--no-sources-package',
      '--reinstall-package',
      '--link-mode',
      '-C',
      '--config-setting',
      '--config-settings-package',
      '--no-build-isolation-package',
      '--no-build-package',
      '--no-binary-package',
      '--cache-dir',
      '--refresh-package',
      '-p',
      '--python',
      '--color',
      '--allow-insecure-host',
      '--directory',
      '--project',
      '--config-file',
      '--trusted-host',
      '--config-settings',
      '--python-preference',
      '--preview-features',
    ],
    [
      '--all-extras',
      '--no-dev',
      '--only-dev',
      '--no-default-groups',
      '--all-groups',
      '-m',
      '--module',
      '--no-editable',
      '--exact',
      '--no-env-file',
      '--isolated',
      '--active',
      '--no-sync',
      '--locked',
      '--frozen',
      '-s',
      '--script',
      '--gui-script',
      '--all-packages',
      '--no-project',
      '--no-index',
      '-U',
      '--upgrade',
      '--no-sources',
      '--reinstall',
      '--compile-bytecode',
      '--no-build-isolation',
      '--no-build',
      '--no-binary',
      '--require-build-hashes',
      '--no-require-build-hashes',
      '-n',
      '--no-cache',
      '--refresh',
      '--managed-python',
      '--no-managed-python',
      '--no-python-downloads',
      '-q',
      '--quiet',
      '-v',
      '--verbose',
      '--system-certs',
      '--offline',
      '--no-progress',
      '--no-config',
      '-h',
      '--help',
    ],
  ),
  pinned: uv.pinned,
  localFirst: true,
  attachedValues: true,
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

interface Option {
  role: Role | undefined;
  value: string | undefined;
  next: number;
}

/**
 * `-it`, `-qw requests`, `-qw=requests` and, where the runner reads attached values, `-qwrequests`: single-letter
 * options given together, of which the last may take a value.
 */
function clusterAt({ options, attachedValues }: Parser, args: readonly string[], index: number): Option {
  const arg = args[index] ?? '';
  for (let at = 1; at < arg.length; at += 1) {
    const role = options.get(`-${arg.charAt(at)}`);
    if (role === 'flag') continue;
    const rest = arg.slice(at + 1);
    if (role === undefined || (/^[^=]/.test(rest) && attachedValues !== true)) {
      return { role: undefined, value: undefined, next: index + 1 };
    }
    if (rest === '') return { role, value: args[index + 1], next: index + 2 };
    return { role, value: rest.replace(/^=/, ''), next: index + 1 };
  }
  return { role: 'flag', value: undefined, next: index + 1 };
}

/** The option at `index`: its role, the value it carries after `=` or as the next argument, and where the rest starts. */
function optionAt(parser: Parser, args: readonly string[], index: number): Option {
  const arg = args[index] ?? '';
  const equals = arg.indexOf('=');
  const name = equals === -1 ? arg : arg.slice(0, equals);
  const role = parser.options.get(name);
  if (role === undefined && /^-[^-]/.test(arg)) return clusterAt(parser, args, index);
  if (equals !== -1) return { role, value: arg.slice(equals + 1), next: index + 1 };
  return role === undefined || role === 'flag'
    ? { role, value: undefined, next: index + 1 }
    : { role, value: args[index + 1], next: index + 2 };
}

const remote = /^https?:\/\//i;

/** The packages with the first argument, unless a source option named the package or the runner starts local code. */
function withFirst({ localFirst }: Runner, packages: string[], first: string | undefined, named: boolean): string[] {
  if (first === undefined) return packages;
  return (localFirst === true ? remote.test(first) : !named) ? [...packages, first] : packages;
}

/**
 * The packages a runner fetches: those its options name, and the first argument when it fetches that. Undefined when
 * an option is unknown, as it may take the next argument as its value; a runner of local code reads it as a flag.
 */
function fetched(runner: Runner, args: readonly string[]): string[] | undefined {
  const packages: string[] = [];
  let named = false;
  let index = 0;
  while (isOption(args[index])) {
    const { role, value, next } = optionAt(runner, args, index);
    if (role === undefined && runner.localFirst !== true) return undefined;
    if (role === 'source' || role === 'extra') packages.push(value ?? '');
    named ||= role === 'source';
    index = next;
  }
  return withFirst(runner, packages, args[index] === '--' ? args[index + 1] : args[index], named);
}

/**
 * The arguments without the subcommand words, each of which may follow options of the runner: `other` when the
 * command names another subcommand, `unreadable` when an unknown option comes before a word that follows later.
 */
function withoutWords(
  runner: Runner,
  words: readonly string[],
  args: readonly string[],
): readonly string[] | 'other' | 'unreadable' {
  const rest = [...args];
  let index = 0;
  for (const word of words) {
    while (isOption(rest[index])) {
      const { role, next } = optionAt(runner, rest, index);
      // Without the word later on, the command names another subcommand, such as `bun --hot server.ts`.
      if (role === undefined) return rest.includes(word, index + 1) ? 'unreadable' : 'other';
      index = next;
    }
    if (rest[index] !== word) return 'other';
    rest.splice(index, 1);
  }
  return rest;
}

/**
 * The program a command names; on Windows that is `npx.cmd` or `NPX.EXE`, behind a path with backslashes, and cmd
 * reads an `@` before it as an order not to echo the command.
 */
function program(command: string): string {
  return command
    .replace(/^.*[/\\]/, '')
    .replace(/\.(?:cmd|exe)$/i, '')
    .replace(/^@/, '')
    .toLowerCase();
}

/** A command of a line a wrapper starts: its words, and whether they hold nothing the shell replaces at run time. */
interface Command {
  words: readonly string[];
  readable: boolean;
}

type TokenKind = 'blank' | 'redirection' | 'separator' | 'part';
type Token = readonly [TokenKind, string];

/** How a shell splits a line: its tokens in order of precedence, and what a part reads as, undefined when replaced. */
interface Dialect {
  tokens: readonly (readonly [TokenKind, RegExp])[];
  part: (text: string) => string | undefined;
  /** Leading `NAME=value` words set variables for the command. */
  assignments: boolean;
}

// Claude Code replaces its plugin paths in a server's command and arguments before a shell reads them.
const pluginPath = /\$\{CLAUDE_PLUGIN_(?:ROOT|DATA)\}/g;
// `>`, `2>&`, `&>` and `<`, followed by their target; a here-document (`<<`) matches no token.
const redirection = /(?:\d*|&)(?:>|<(?!<))[>&|]?/y;

function tokenKinds(separator: RegExp, part: RegExp, blank = /[ \t]+/y): Dialect['tokens'] {
  return [
    ['blank', blank],
    ['redirection', redirection],
    ['separator', separator],
    ['part', part],
  ];
}

/** A part of a line of sh or PowerShell: single quotes hold text literally, `$` elsewhere expands a variable. */
function expandingPart(text: string, unescape: (quoted: string) => string): string | undefined {
  if (text.startsWith("'")) return text.slice(1, -1);
  if (text.replaceAll(pluginPath, '').includes('$')) return undefined;
  return text.startsWith('"') ? unescape(text.slice(1, -1)) : text;
}

const posixEscape = /\\([$`"\\\n])/g;
const unescaped = (_escape: string, char: string): string => (char === '\n' ? '' : char);

/**
 * sh and the shells that share its syntax; a subshell, group, command substitution, or a comment or `!` that starts a
 * part, matches no token, and a line continuation between blanks is a blank.
 */
const posix: Dialect = {
  tokens: tokenKinds(
    /[;&|\n]/y,
    /'[^']*'|"(?:[^"\\`]|\\[\s\S])*"|\\[\s\S]|(?:\$\{\w+\}|[^\s'"\\;&|<>(){}`!#])(?:\$\{\w+\}|[^\s'"\\;&|<>(){}`])*/y,
    /(?:[ \t]|\\\n(?=[ \t\n]|$))+/y,
  ),
  part: (text) =>
    text.startsWith('\\')
      ? unescaped(text, text.slice(1))
      : expandingPart(text, (quoted) => quoted.replace(posixEscape, unescaped)),
  assignments: true,
};

/** PowerShell: a backslash is a path character, and the backtick escape matches no token. */
const powershell: Dialect = {
  tokens: tokenKinds(/[;&|\n]/y, /'[^']*'|"[^"`]*"|(?:\$\{\w+\}|[^\s'"`;&|<>(){}#])+/y),
  part: (text) => expandingPart(text, (quoted) => quoted),
  assignments: false,
};

/** cmd: a quote, a parenthesis or a caret matches no token, `%` and `!` expand variables, `;` is a plain character. */
const cmd: Dialect = {
  tokens: tokenKinds(/[&|\n]/y, /[^\s"&|<>()^]+/y),
  part: (text) => (/[%!]/.test(text) ? undefined : text),
  assignments: false,
};

function tokenAt(kinds: Dialect['tokens'], line: string, at: number): Token | undefined {
  for (const [kind, pattern] of kinds) {
    pattern.lastIndex = at;
    const text = pattern.exec(line)?.[0];
    if (text !== undefined) return [kind, text];
  }
  return undefined;
}

/** The tokens of a line; undefined when a character matches none. */
function tokens(line: string, dialect: Dialect): Token[] | undefined {
  const found: Token[] = [];
  let at = 0;
  while (at < line.length) {
    const token = tokenAt(dialect.tokens, line, at);
    if (token === undefined) return undefined;
    found.push(token);
    at += token[1].length;
  }
  return found;
}

/** The parts of each word of one command, without its redirections and their targets. */
function wordParts(found: readonly Token[]): readonly (readonly string[])[] {
  const words: string[][] = [];
  let word: string[] | undefined;
  let target = false;
  for (const [kind, text] of [...found, ['blank', ''] as const]) {
    if (kind === 'part') {
      (word ??= []).push(text);
      continue;
    }
    if (word !== undefined && !target) words.push(word);
    target = kind === 'redirection' || (target && word === undefined);
    word = undefined;
  }
  return words;
}

/** The words of one command, without its redirections and leading assignments. */
function commandOf(found: readonly Token[], dialect: Dialect): Command {
  const parts = wordParts(found).map((word) => word.map((part) => [part, dialect.part(part)] as const));
  const words = parts.map((word) => word.map(([part, value]) => value ?? part).join(''));
  const start = dialect.assignments ? words.length - withoutAssignments(words, shellAssignment).length : 0;
  return {
    words: words.slice(start),
    readable: parts.slice(start).every((word) => word.every(([, value]) => value !== undefined)),
  };
}

/** The commands of a line, split at `;`, `&`, `|` and their doubles; undefined when the line cannot be split. */
function lineCommands(line: string, dialect: Dialect): readonly Command[] | undefined {
  const found = tokens(line, dialect);
  if (found === undefined) return undefined;
  const split: Command[] = [];
  let start = 0;
  for (const [index, [kind]] of [...found, ['separator', ''] as const].entries()) {
    if (kind !== 'separator') continue;
    const command = commandOf(found.slice(start, index), dialect);
    if (command.words.length > 0) split.push(command);
    start = index + 1;
  }
  return split;
}

const shellAssignment = /^[A-Za-z_]\w*=/;
// env reads every argument holding `=` as an assignment.
const envAssignment = /=/;
const shellValueOptions: ReadonlySet<string> = new Set(['--rcfile', '--init-file']);
const noOptions: Parser = { options: new Map() };
const envOptions: Parser = {
  options: roles([], [], ['-u', '--unset', '-C', '--chdir'], ['-i', '--ignore-environment']),
};
const execOptions: Parser = { options: roles([], [], ['-a'], ['-c', '-l']) };
const commandOptions: Parser = { options: roles([], [], [], ['-p', '-v', '-V']) };
// Commands that never run their arguments, so a runner named in them is text.
const textOnly: ReadonlySet<string> = new Set(['cd', 'echo', 'printf']);
// Deeper nesting reads as unreadable, so a crafted command line costs bounded work.
const maxWrappers = 8;

/** The command after the leading `NAME=value` assignments. */
function withoutAssignments(words: readonly string[], assignment: RegExp): readonly string[] {
  const start = words.findIndex((word) => !assignment.test(word));
  return start === -1 ? [] : words.slice(start);
}

/** `cmd /c` or `/k`, after switches such as `/d` and `/s`, runs the rest as one command line. */
function cmdCommands(words: readonly string[]): readonly Command[] | undefined {
  const args = words.slice(1);
  const run = args.findIndex((arg) => !arg.startsWith('/') || /^\/[ck]$/i.test(arg));
  return /^\/[ck]$/i.test(args[run] ?? '') ? lineCommands(args.slice(run + 1).join(' '), cmd) : [];
}

/** Where the operands of sh or bash start, after their options, and whether one of these is `-c`. */
function shellOptions(args: readonly string[]): { operand: number; command: boolean } {
  let index = 0;
  let command = false;
  for (let option = args[0] ?? ''; /^[-+]./.test(option) && option !== '--'; option = args[index] ?? '') {
    command ||= /^-[A-Za-z]*c/.test(option);
    // `-o`, `-O` and a cluster holding them, such as `-euo pipefail` or `-oc pipefail`, take the next argument.
    index += /^[-+][A-Za-z]*[oO]/.test(option) || shellValueOptions.has(option) ? 2 : 1;
  }
  return { operand: args[index] === '--' ? index + 1 : index, command };
}

/** sh and the shells like it run their first operand as a command line with `-c`; without it, a local script. */
function shellCommands(words: readonly string[]): readonly Command[] | undefined {
  const args = words.slice(1);
  const { operand, command } = shellOptions(args);
  if (!command) return [];
  const line = lineCommands(args[operand] ?? '', posix);
  // The operands after the command line fill `$0`, `$1` and `$@`, which the line may run.
  return line && [...line, { words: args.slice(operand + 1), readable: false }];
}

/** What a PowerShell option starts, by any prefix of its name: a command line, a script file or an encoded command. */
function powershellStart(word: string): 'line' | 'file' | 'encoded' | undefined {
  const name = /^(?:--?|\/)([a-z]+)$/i.exec(word)?.[1]?.toLowerCase() ?? '-';
  if ('command'.startsWith(name) || 'commandwithargs'.startsWith(name) || name === 'cwa') return 'line';
  if ('file'.startsWith(name)) return 'file';
  return 'encodedcommand'.startsWith(name) || name === 'ec' ? 'encoded' : undefined;
}

/**
 * PowerShell runs the rest of its arguments as one command line after `-Command`, a local script after `-File`;
 * without either it runs its first operand as the positional default holds.
 */
function powershellCommands(words: readonly string[], positional: readonly Command[] | undefined) {
  const at = words.findIndex((word, index) => index > 0 && powershellStart(word) !== undefined);
  const start = powershellStart(words[at] ?? '');
  if (start === 'line') return lineCommands(words.slice(at + 1).join(' '), powershell);
  if (start === 'file') return [];
  return start === 'encoded' ? undefined : positional;
}

/** The words a prefix command runs after its options; undefined when an option is unknown. */
function afterOptions(parser: Parser, words: readonly string[]): readonly string[] | undefined {
  const args = words.slice(1);
  let index = 0;
  while (isOption(args[index])) {
    const { role, next } = optionAt(parser, args, index);
    if (role === undefined) return undefined;
    index = next;
  }
  return args.slice(args[index] === '--' ? index + 1 : index);
}

function started(words: readonly string[] | undefined): readonly Command[] | undefined {
  return words === undefined ? undefined : [{ words, readable: true }];
}

/** `env` runs the command after its options and assignments. */
function envCommands(words: readonly string[]): readonly Command[] | undefined {
  const rest = afterOptions(envOptions, words);
  return started(rest === undefined ? undefined : withoutAssignments(rest, envAssignment));
}

/** `command` runs the command after its options; with `-v` or `-V` it only names it. */
function commandCommands(words: readonly string[]): readonly Command[] | undefined {
  const rest = afterOptions(commandOptions, words);
  if (rest === undefined) return undefined;
  const options = words.slice(1, words.length - rest.length);
  return options.some((option) => /^-\w*[vV]/.test(option)) ? [] : started(rest);
}

/** What a wrapper or prefix starts: the commands, none when it runs a local script, undefined when unreadable. */
const wrappers: ReadonlyMap<string, (words: readonly string[]) => readonly Command[] | undefined> = new Map([
  ['cmd', cmdCommands],
  ['sh', shellCommands],
  ['bash', shellCommands],
  ['dash', shellCommands],
  ['ksh', shellCommands],
  ['zsh', shellCommands],
  // pwsh runs a positional operand as a script file, Windows PowerShell as a command line, which reads as unreadable.
  ['pwsh', (words: readonly string[]) => powershellCommands(words, [])],
  ['powershell', (words: readonly string[]) => powershellCommands(words, undefined)],
  ['env', envCommands],
  ['command', commandCommands],
  ['exec', (words: readonly string[]) => started(afterOptions(execOptions, words))],
  ['nohup', (words: readonly string[]) => started(afterOptions(noOptions, words))],
  ['call', (words: readonly string[]) => started(afterOptions(noOptions, words))],
]);

// The words of a line a wrapper starts, between blanks, operators and quotes.
const lineWord = /[^\s;&|()<>"'`^]+/g;

/**
 * Whether a command line names a runner: its program followed by its subcommand words; for a runner of local code
 * also an option after them that installs a package, such as `uv run --with`.
 */
function namesRunner(line: readonly string[]): boolean {
  const words = line.join(' ').match(lineWord) ?? [];
  const names = words.map(program);
  return commands.some(([known, subcommand, runner]) => {
    const lastExtra =
      runner.localFirst === true
        ? words.findLastIndex((word) => runner.options.get(word.split('=')[0] ?? '') === 'extra')
        : words.length;
    return names.some(
      (name, index) =>
        name === known &&
        subcommand.every((word, offset) => names[index + 1 + offset] === word) &&
        lastExtra > index + subcommand.length,
    );
  });
}

/** Whether the command of a runner fetches a package without its exact version; undefined for another command. */
function runnerUnpinned(words: readonly string[]): boolean | undefined {
  const [inner = '', ...own] = words;
  const name = program(inner);
  for (const [known, subcommand, runner] of commands) {
    const rest = known === name ? withoutWords(runner, subcommand, own) : 'other';
    if (rest === 'other') continue;
    const packages = rest === 'unreadable' ? undefined : fetched(runner, rest);
    if (packages === undefined) return true;
    return packages.length === 0 ? runner.localFirst !== true : !packages.every(runner.pinned);
  }
  return undefined;
}

/** Whether a command, or a command its wrappers start, fetches a package without its exact version. */
function unpinnedCommand({ words, readable }: Command, depth: number): boolean {
  const name = program(words[0] ?? '');
  const unwrap = wrappers.get(name);
  if (!readable || (unwrap !== undefined && depth === maxWrappers)) return namesRunner(words);
  // Another command, such as `eval`, `timeout` or a keyword like `then`, may run a runner it names.
  if (unwrap === undefined) return runnerUnpinned(words) ?? (!textOnly.has(name) && namesRunner(words));
  const inner = unwrap(words);
  return inner === undefined ? namesRunner(words) : inner.some((command) => unpinnedCommand(command, depth + 1));
}

/**
 * Whether a stdio server's command fetches a package at start without naming its exact version.
 * An unknown command runs local code and fetches nothing; a runner whose package cannot be found counts as unpinned,
 * and so does a wrapped command that cannot be read when it names a runner.
 */
export function unpinnedPackage(command: string, args: readonly string[]): boolean {
  return unpinnedCommand({ words: [command, ...args], readable: true }, 0);
}
