import { expect, it } from 'vitest';
import { analyzeAgent } from './agent-analyzer.ts';

it('reads an empty tools field and model inherit as not set, and drops inline comments', () => {
  const { name, toolsDeclared, modelSet } = analyzeAgent(
    '---\nname: reviewer # shown in the menu\ntools:\nmodel: inherit # the session model\n---\nReview.\n',
  );
  expect({ name, toolsDeclared, modelSet }).toEqual({ name: 'reviewer', toolsDeclared: false, modelSet: false });
});
