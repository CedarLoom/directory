import { z } from 'zod';
import { spdxId } from './fields.ts';

/** A parsed SPDX license expression: one license, or the parts an AND or an OR joins. */
export type SpdxExpression = { license: string } | { operator: 'AND' | 'OR'; parts: SpdxExpression[] };

const licenseIds: ReadonlySet<string> = new Set(spdxId.options);
const licenseRef = /^LicenseRef-[A-Za-z0-9.-]+$/;
// Exception ids are checked by their form only, as no dependency with an allowed license holds the exception list.
const exceptionId = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const operators: ReadonlySet<string> = new Set(['AND', 'OR', 'WITH']);

/** The license of a term: a listed id, which a + for "or later" may follow, or a LicenseRef. */
function termLicense(token: string): string | undefined {
  const license = token.replace(/\+$/, '');
  if (licenseIds.has(license)) return license;
  return license === token && licenseRef.test(token) ? token : undefined;
}

const isException = (token: string | undefined) =>
  token !== undefined && !operators.has(token) && exceptionId.test(token);

function parse(tokens: readonly string[]): SpdxExpression | undefined {
  let position = 0;
  const take = (operator: string): boolean => {
    if (tokens[position] !== operator) return false;
    position += 1;
    return true;
  };

  function simple(): SpdxExpression | undefined {
    const token = tokens[position++];
    if (token === '(') {
      const inner = or();
      return tokens[position++] === ')' ? inner : undefined;
    }
    const license = token === undefined ? undefined : termLicense(token);
    if (license === undefined || (take('WITH') && !isException(tokens[position++]))) return undefined;
    return { license };
  }

  function joined(operator: 'AND' | 'OR', part: () => SpdxExpression | undefined): SpdxExpression | undefined {
    const parts: SpdxExpression[] = [];
    do {
      const next = part();
      if (next === undefined) return undefined;
      parts.push(next);
    } while (take(operator));
    return parts.length === 1 ? parts[0] : { operator, parts };
  }

  const and = () => joined('AND', simple);
  const or = (): SpdxExpression | undefined => joined('OR', and);
  const expression = or();
  return position === tokens.length ? expression : undefined;
}

/** Parses an SPDX license expression of listed license ids and LicenseRefs (SPDX 2.3, Annex D); else undefined. */
export function parseSpdxExpression(value: string): SpdxExpression | undefined {
  if (value.length > 200 || !/^[A-Za-z0-9.+() -]*$/.test(value)) return undefined;
  return parse(value.match(/[()]|[^ ()]+/g) ?? []);
}

// A LicenseRef or an exception id is text the item's author chooses, so a record holds only listed license ids.
const namesListedIdsOnly = (value: string) =>
  (value.match(/[()]|[^ ()]+/g) ?? []).every(
    (token) =>
      token === '(' || token === ')' || token === 'AND' || token === 'OR' || licenseIds.has(token.replace(/\+$/, '')),
  ) && parseSpdxExpression(value) !== undefined;

/** An SPDX license expression such as `MIT OR Apache-2.0`; a single license id is one too. */
export const spdxExpression = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9.+()-](?:[A-Za-z0-9.+() -]*[A-Za-z0-9.+()-])?$/)
  .refine(namesListedIdsOnly, 'an SPDX license expression of listed license ids')
  .describe(
    'An SPDX license expression (SPDX 2.3, Annex D) of SPDX License List ids joined by AND and OR, as the item states it.',
  );
