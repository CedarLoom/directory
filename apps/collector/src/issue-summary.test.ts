import { keyword } from '@directory/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { issueSummary } from './issue-summary.ts';

it('prints a path segment that is no keyword as a placeholder, so a third-party key stays out of the log', () => {
  const result = z
    .object({ hooksByEvent: z.record(keyword, z.int()) })
    .safeParse({ hooksByEvent: { 'Stop\n::error::injected line': 1, PreToolUse: 'two' } });
  expect(result.success ? '' : issueSummary(result.error, 'value')).toBe(
    'hooksByEvent.* invalid_key, hooksByEvent.PreToolUse invalid_type',
  );
});
