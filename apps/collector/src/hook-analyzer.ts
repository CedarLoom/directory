import { hookRecord, keyword } from '@directory/contracts';
import { z } from 'zod';
import { jsonText } from './json-text.ts';

const handlerTypes = ['command', 'http', 'prompt', 'agent'] as const;
// Upstream files carry more keys than these; only the keys a fact needs are read, the rest is stripped.
// A handler type not listed above is read but left out of the facts, so it cannot hide the file's other handlers.
const handler = z.object({ type: z.string(), command: z.unknown().optional(), args: z.unknown().optional() });
const group = z.object({ matcher: z.string().optional(), hooks: z.array(handler) });
const events = z.record(z.string(), z.array(group));
const hooksFile = z.object({ hooks: events.optional() });
// `hooks` in plugin.json holds the same object as a hooks file, or the events directly.
const inlineHooks = z.union([z.object({ hooks: events }), events.transform((hooks) => ({ hooks }))]);

export interface HookFacts {
  events: string[];
  handlerTypes: (typeof handlerTypes)[number][];
  commandForms: ('shell' | 'exec')[];
  matcherBreadth: 'match-all' | 'specific' | 'none';
  /** A command or its arguments name a download tool or a URL; scored as a flag, not stored as a fact. */
  networkIndicator: boolean;
}

// A command that fetches or posts over the network; `\b` keeps names such as `curling` out.
const networkCommand = /\b(?:curl|wget|Invoke-WebRequest)\b|https?:\/\//i;

// On these events a group without a matcher runs for every tool.
const toolEvents: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
]);

// A matcher is a regular expression, which no check classifies in full: an alternative of wildcards only, such as `.*`,
// `(?:.+)` or `^.*.*$`, matches every tool name.
function wildcardOnly(matcher: string): boolean {
  return (
    matcher === '*' ||
    matcher
      .replaceAll(/\(\?:|[()^$]/g, '')
      .split('|')
      .some((alternative) => /^[.*+?]+$/.test(alternative) && /\.[*+]/.test(alternative))
  );
}

type Group = z.infer<typeof group>;
export type HookEvents = z.infer<typeof events>;

function matcherBreadth(groups: readonly (readonly [string, Group])[]): HookFacts['matcherBreadth'] {
  const matchesAll = ([event, { matcher }]: readonly [string, Group]) =>
    (matcher !== undefined && wildcardOnly(matcher)) ||
    ((matcher === undefined || matcher === '') && toolEvents.has(event));
  if (groups.some(matchesAll)) return 'match-all';
  return groups.some(([, { matcher }]) => matcher !== undefined && matcher !== '') ? 'specific' : 'none';
}

/** The events of a hooks file; a file without a `hooks` object, such as one that only lists modules, holds no hooks. */
export function hookEvents(text: string): HookEvents | undefined {
  return jsonText.pipe(hooksFile).parse(text).hooks;
}

/** The events of the `hooks` value of plugin.json; a malformed value throws, as a malformed hooks file does. */
export function inlineHookEvents(value: unknown): HookEvents {
  return inlineHooks.parse(value).hooks;
}

const recordEvents = hookRecord.pick({ events: true });

/** The facts of a hooks file; more events than the record holds throw a ZodError. */
export function analyzeHooks(text: string): HookFacts | undefined {
  const hooks = hookEvents(text);
  if (hooks === undefined) return undefined;
  const facts = hookFacts(hooks);
  return { ...facts, events: recordEvents.parse({ events: facts.events }).events };
}

export function hookFacts(hooks: HookEvents): HookFacts {
  const groups = Object.entries(hooks).flatMap(([event, list]) => list.map((entry) => [event, entry] as const));
  const handlers = groups.flatMap(([, { hooks: list }]) => list);
  const commands = handlers.filter(({ type }) => type === 'command');
  // A command with an `args` list runs without a shell.
  const forms = new Set(commands.map(({ args }) => (Array.isArray(args) ? 'exec' : 'shell')));
  const types = new Set(handlers.map(({ type }) => type));
  return {
    // An event without a handler runs nothing.
    events: Object.entries(hooks)
      .filter(([event, list]) => keyword.safeParse(event).success && list.some((entry) => entry.hooks.length > 0))
      .map(([event]) => event),
    handlerTypes: handlerTypes.filter((type) => types.has(type)),
    commandForms: (['shell', 'exec'] as const).filter((form) => forms.has(form)),
    matcherBreadth: matcherBreadth(groups),
    networkIndicator: commands
      .flatMap(({ command, args }) => (Array.isArray(args) ? [command].concat(args) : [command]))
      .some((word) => typeof word === 'string' && networkCommand.test(word)),
  };
}
