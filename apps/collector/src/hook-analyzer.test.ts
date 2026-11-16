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
