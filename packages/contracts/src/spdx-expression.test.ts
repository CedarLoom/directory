import { expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpdxExpression, spdxExpression } from './spdx-expression.ts';

it('matches license and exception ids in any case and keeps them in the listed case', () =>
  expect(parseSpdxExpression('apache-2.0 OR gpl-2.0-only WITH classpath-exception-2.0')).toEqual({
    operator: 'OR',
    parts: [{ license: 'Apache-2.0' }, { license: 'GPL-2.0-only', exception: 'Classpath-exception-2.0' }],
  }));

it('refuses a WITH operand that is no listed exception id', () =>
  expect(
    ['MIT WITH MIT', 'MIT WITH No-commercial-use', 'GPL-2.0-only WITH LicenseRef-Extra'].map(parseSpdxExpression),
  ).toEqual([undefined, undefined, undefined]));

it('writes the listed ids into the JSON Schema pattern', () => {
  const pattern = new RegExp(z.toJSONSchema(spdxExpression).pattern ?? '');
  expect(
    [
      'MIT OR Apache-2.0',
      '(MIT OR ISC) AND GPL-2.0-only WITH Classpath-exception-2.0',
      'Apache-3.0',
      'hello world',
      'LicenseRef-Call-555-0100',
      'MIT WITH No-commercial-use',
    ].map((value) => pattern.test(value)),
  ).toEqual([true, true, false, false, false, false]);
});
