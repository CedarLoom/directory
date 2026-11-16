import { expect, it } from 'vitest';
import { analyzeHooks } from './hook-analyzer.ts';

it('reads a .* matcher as match-all and a command with args as exec', () => {
  const file = {
    hooks: {
      Stop: [{ hooks: [{ type: 'prompt' }] }],
      PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: 'lint', args: ['--fix'] }] }],
    },
  };
  expect(analyzeHooks(JSON.stringify(file))).toEqual({
    events: ['Stop', 'PreToolUse'],
    handlerTypes: ['command', 'prompt'],
    commandForms: ['exec'],
    matcherBreadth: 'match-all',
  });
});

it('holds no hooks in a file that only lists modules', () => {
  expect(analyzeHooks(JSON.stringify({ modules: ['./audit.js'] }))).toBeUndefined();
});

it('leaves an event key that is no keyword out of the events', () => {
  const file = { hooks: { _comment: [], Stop: [{ hooks: [{ type: 'prompt' }] }] } };
  expect(analyzeHooks(JSON.stringify(file))?.events).toEqual(['Stop']);
});

function breadth(matcher: string) {
  return analyzeHooks(JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks: [{ type: 'prompt' }] }] } }))
    ?.matcherBreadth;
}

it('reads the common spellings of a match-all regular expression as match-all', () => {
  expect(['.+', '^.*$', '^.+$', '(.*)', 'Bash'].map(breadth)).toEqual([
    'match-all',
    'match-all',
    'match-all',
    'match-all',
    'specific',
  ]);
});
