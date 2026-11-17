import { expect, it } from 'vitest';
import { toolClasses, unrestrictedBash } from './tool-classes.ts';

it('classes a tool named like an object property as other', () => {
  expect(toolClasses('constructor, toString')).toEqual(['other']);
});

it('reads a bare Bash or Bash(*) as unrestricted and a Bash rule as restricted', () => {
  expect([
    unrestrictedBash('Read, Bash'),
    unrestrictedBash(['Read', 'Bash(*)']),
    unrestrictedBash('Bash(git diff:*)'),
    unrestrictedBash('BashOutput'),
  ]).toEqual([true, true, false, false]);
});
