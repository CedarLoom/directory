import { z } from 'zod';

/**
 * `curation/exclusions.json`: a keyed hash of each id the collector leaves out, with every item whose container is one
 * of them, so the public file names no item and cannot be matched against the ids of earlier published data.
 */
export const exclusionsFile = z.strictObject({
  schemaVersion: z.literal(2),
  hashes: z
    .array(z.string().regex(/^[0-9a-f]{64}$/))
    .describe('The HMAC-SHA-256 of each excluded id under the secret exclusions key, as lowercase hex.'),
});
