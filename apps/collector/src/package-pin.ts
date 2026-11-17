/** An image names a tag or digest other than `latest`; the tag follows the last `/`, after any registry port. */
export function imagePinned(identifier: string): boolean {
  const image = identifier.slice(identifier.lastIndexOf('/') + 1);
  return /[:@]/.test(image) && !image.endsWith(':latest');
}

// `name@1.2.3` or `@scope/name@1.2.3`: a range, a tag or a URL resolves to whatever the registry holds at start.
const npmExact = /^(?:@[^@/\s]+\/)?[^@/\s]+@v?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
// `name==1.2.3` or `name@1.2.3`, extras allowed; `latest`, a wildcard or a second specifier is not one version.
const uvExact = /^[\w.-]+(?:\[[\w.,-]*\])?(?:==|@)(?!latest$)[^*\s,;<>=!~@]+$/;

/**
 * What the value of an option names: the package to run (the first argument is then a command inside it), a further
 * package to install, or something else.
 */
type Role = 'source' | 'extra' | 'value';

interface Runner {
  options: ReadonlyMap<string, Role>;
  pinned: (reference: string) => boolean;
}

function roles(source: readonly string[], extra: readonly string[], value: readonly string[]): Map<string, Role> {
  return new Map([
    ...source.map((name) => [name, 'source'] as const),
    ...extra.map((name) => [name, 'extra'] as const),
    ...value.map((name) => [name, 'value'] as const),
  ]);
}

const runners: ReadonlyMap<string, Runner> = new Map([
  [
    'npx',
    {
      options: roles(
        ['-p', '--package'],
        [],
        ['-c', '--call', '--registry', '--cache', '--prefix', '--userconfig', '-w', '--workspace'],
      ),
      pinned: (reference: string) => npmExact.test(reference),
    },
  ],
  [
    'uvx',
    {
      options: roles(
        ['--from'],
        ['--with'],
        ['-p', '--python', '--index', '--default-index', '--index-url', '--extra-index-url', '--directory'],
      ),
      pinned: (reference: string) => uvExact.test(reference),
    },
  ],
  [
    'docker',
    {
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
      ),
      pinned: imagePinned,
    },
  ],
]);

const isOption = (arg: string | undefined): boolean => arg !== undefined && arg !== '--' && arg.startsWith('-');

interface Option {
  role: Role | undefined;
  value: string | undefined;
  next: number;
}

/** The option at `index`: its role, the value it carries after `=` or as the next argument, and where the rest starts. */
function optionAt(options: ReadonlyMap<string, Role>, args: readonly string[], index: number): Option {
  const arg = args[index] ?? '';
  const equals = arg.indexOf('=');
  const role = options.get(equals === -1 ? arg : arg.slice(0, equals));
  if (equals !== -1) return { role, value: arg.slice(equals + 1), next: index + 1 };
  return role === undefined
    ? { role, value: undefined, next: index + 1 }
    : { role, value: args[index + 1], next: index + 2 };
}

/** The packages a runner fetches: those its options name, and the first argument unless a source option named the package. */
function fetched({ options }: Runner, args: readonly string[]): string[] {
  const packages: string[] = [];
  let named = false;
  let index = 0;
  while (isOption(args[index])) {
    const { role, value, next } = optionAt(options, args, index);
    if (role === 'source' || role === 'extra') packages.push(value ?? '');
    named ||= role === 'source';
    index = next;
  }
  const first = args[index] === '--' ? args[index + 1] : args[index];
  return named || first === undefined ? packages : [...packages, first];
}

/**
 * Whether a stdio server's command fetches a package at start without naming its exact version.
 * An unknown command runs local code and fetches nothing; a runner whose package cannot be found counts as unpinned.
 */
export function unpinnedPackage(command: string, args: readonly string[]): boolean {
  const name = command.slice(command.lastIndexOf('/') + 1);
  const runner = runners.get(name);
  if (runner === undefined) return false;
  const packages = fetched(runner, name === 'docker' && args[0] === 'run' ? args.slice(1) : args);
  return packages.length === 0 || !packages.every(runner.pinned);
}
