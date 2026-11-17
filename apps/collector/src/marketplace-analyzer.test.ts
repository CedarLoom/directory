import { expect, it } from 'vitest';
import { entrySources } from './marketplace-analyzer.ts';

it('notes two entries of one name', () =>
  expect(
    entrySources([
      { name: 'lint', source: './lint' },
      { name: 'lint', source: './lint-next' },
    ]).duplicateNames,
  ).toBe(true));
