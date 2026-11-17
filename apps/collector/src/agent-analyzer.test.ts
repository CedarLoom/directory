import { expect, it } from 'vitest';
import { analyzeAgent } from './agent-analyzer.ts';

it('reads an empty tools field and model inherit as not set, and drops inline comments', () => {
  const { name, toolsDeclared, modelSet } = analyzeAgent(
    '---\nname: reviewer # shown in the menu\ntools:\nmodel: inherit # the session model\n---\nReview.\n',
  );
  expect({ name, toolsDeclared, modelSet }).toEqual({ name: 'reviewer', toolsDeclared: false, modelSet: false });
});

const read = (tools: string) => {
  const { toolClasses, unrestrictedBash } = analyzeAgent(`---\nname: shell\n${tools}\n---\nRun.\n`);
  return { toolClasses, unrestrictedBash };
};

it('reads Bash in a tools list that holds a comment or spans lines', () => {
  const bash = { toolClasses: ['read', 'bash'], unrestrictedBash: true };
  expect([
    read('tools:\n  # shell access\n  - Read\n  - Bash'),
    read('tools: # shell access\n  - Read\n  - Bash'),
    read('tools: [Read,\n  Bash]'),
  ]).toEqual([bash, bash, bash]);
});
