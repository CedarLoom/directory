import { keyword } from '@directory/contracts';
import type { ZodError } from 'zod';

// A path segment can be a key of a third-party file, such as a hook event name; only a keyword or an index is printed.
function segment(part: PropertyKey): string {
  return typeof part === 'number' || keyword.safeParse(part).success ? String(part) : '*';
}

/** A refusal's issue paths and codes; an issue message could quote the refused third-party text. */
export function issueSummary(error: ZodError, root: string): string {
  return error.issues.map(({ path, code }) => `${path.map(segment).join('.') || root} ${code}`).join(', ');
}
