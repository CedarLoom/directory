import { z } from 'zod';

/** Third-party JSON text; malformed text is refused as a ZodError like any other entry, without quoting it. */
export const jsonText = z.string().transform((text, context): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: 'custom', message: 'not JSON' });
    return z.NEVER;
  }
});
