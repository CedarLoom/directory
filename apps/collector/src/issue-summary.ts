import type { ZodError } from 'zod';

/** A refusal's issue paths and codes; an issue message could quote the refused third-party text. */
export function issueSummary(error: ZodError, root: string): string {
  return error.issues.map(({ path, code }) => `${path.join('.') || root} ${code}`).join(', ');
}
