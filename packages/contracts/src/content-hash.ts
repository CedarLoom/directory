import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// An optional property of a parsed record may hold undefined.
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json | undefined };

/**
 * JSON with object keys sorted by UTF-16 code units at every level and no whitespace (RFC 8785 for these values).
 * A key whose value is undefined is left out, as JSON.stringify does.
 */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter((entry): entry is [string, Json] => entry[1] !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  // JSON.stringify writes NaN and Infinity as null, which would give two different values the same hash.
  if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError(`Not a JSON number: ${value}`);
  return JSON.stringify(value);
}

/** SHA-256 of the canonical JSON as lowercase hex. */
export function contentHash(value: Json): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))));
}
