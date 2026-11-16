// Fails typecheck when tests in a logic package lose the test runtime's types (root tsconfig.json includes them).
import { expect, it } from 'vitest';

it('typechecks and runs in a logic package', () => expect(1 + 1).toBe(2));
