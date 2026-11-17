import { keyword } from '@directory/contracts';
import { z } from 'zod';
import { jsonText } from './json-text.ts';

const handlerTypes = ['command', 'http', 'prompt', 'agent'] as const;
// Upstream files carry more keys than these; only the keys a fact needs are read, the rest is stripped.
const handler = z.object({ type: z.enum(handlerTypes), args: z.unknown().optional() });
const group = z.object({ matcher: z.string().optional(), hooks: z.array(handler) });
const hooksFile = z.object({ hooks: z.record(z.string(), z.array(group)).optional() });

export interface HookFacts {
  events: string[];
  handlerTypes: (typeof handlerTypes)[number][];
  commandForms: ('shell' | 'exec')[];
  matcherBreadth: 'match-all' | 'specific' | 'none';
}

// On these events a group without a matcher runs for every tool.
const toolEvents: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
]);

// A matcher is a regular expression, which no list classifies in full; these common spellings match every tool name.
const matchAllPatterns: ReadonlySet<string> = new Set(['*', '.*', '.+', '^.*$', '^.+$', '(.*)']);

type Group = z.infer<typeof group>;

function matcherBreadth(groups: readonly (readonly [string, Group])[]): HookFacts['matcherBreadth'] {
  const matchesAll = ([event, { matcher }]: readonly [string, Group]) =>
    matchAllPatterns.has(matcher ?? '') || ((matcher === undefined || matcher === '') && toolEvents.has(event));
  if (groups.some(matchesAll)) return 'match-all';
  return groups.some(([, { matcher }]) => matcher !== undefined && matcher !== '') ? 'specific' : 'none';
}

/** The facts of a hooks file; a file without a `hooks` object, such as one that only lists modules, holds no hooks. */
export function analyzeHooks(text: string): HookFacts | undefined {
  const { hooks } = jsonText.pipe(hooksFile).parse(text);
  if (hooks === undefined) return undefined;
  const groups = Object.entries(hooks).flatMap(([event, list]) => list.map((entry) => [event, entry] as const));
  const handlers = groups.flatMap(([, { hooks: list }]) => list);
  const commands = handlers.filter(({ type }) => type === 'command');
  // A command with an `args` list runs without a shell.
  const forms = new Set(commands.map(({ args }) => (Array.isArray(args) ? 'exec' : 'shell')));
  const types = new Set(handlers.map(({ type }) => type));
  return {
    events: Object.keys(hooks).filter((event) => keyword.safeParse(event).success),
    handlerTypes: handlerTypes.filter((type) => types.has(type)),
    commandForms: (['shell', 'exec'] as const).filter((form) => forms.has(form)),
    matcherBreadth: matcherBreadth(groups),
  };
}
