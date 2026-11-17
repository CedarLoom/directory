import { expect, it } from 'vitest';
import { readFrontmatter } from './frontmatter.ts';

it('reads a block scalar and an indented continuation as their lines joined by spaces', () => {
  const { fields } = readFrontmatter(
    '---\ndescription: >-\n  Reviews a diff\n  for bugs.\nsummary: Lints\n  each file.\ntools:\n  - Read\n---\nBody\n',
  );
  expect(Object.fromEntries(fields)).toEqual({
    description: 'Reviews a diff for bugs.',
    summary: 'Lints each file.',
    tools: ['Read'],
  });
});
