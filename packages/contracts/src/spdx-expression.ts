import { z } from 'zod';
import { spdxId } from './fields.ts';
import { spdxExceptionIds } from './spdx-exception-ids.ts';

/** A parsed SPDX license expression: one license, its + and its exception, or the parts an AND or an OR joins. */
export type SpdxExpression =
  | { license: string; plus?: true; exception?: string }
  | { operator: 'AND' | 'OR'; parts: SpdxExpression[] };

// SPDX ids match in any case (SPDX 2.3, Annex D); a parsed expression holds them in the listed case.
const byLowerCase = (ids: readonly string[]): ReadonlyMap<string, string> =>
  new Map(ids.map((id) => [id.toLowerCase(), id]));
const licenseIds = byLowerCase(spdxId.options);
const exceptionIds = byLowerCase(spdxExceptionIds);
const licenseRef = /^LicenseRef-[A-Za-z0-9.-]+$/i;
// GPL-2.0-only+ or GPL-2.0-or-later+ contradicts itself.
const versionScoped = /-(?:only|or-later)$/;

/** The listed SPDX license id that `value` names in any case; else undefined. */
export function listedLicenseId(value: string): string | undefined {
  return licenseIds.get(value.toLowerCase());
}

function term(token: string): Extract<SpdxExpression, { license: string }> | undefined {
  const plus = token.endsWith('+');
  const id = listedLicenseId(plus ? token.slice(0, -1) : token);
  if (id === undefined) return !plus && licenseRef.test(token) ? { license: token } : undefined;
  if (!plus) return { license: id };
  if (versionScoped.test(id)) return undefined;
  // A plus id such as GPL-2.0+ is the -or-later id the list has for it.
  const orLater = listedLicenseId(`${id}-or-later`);
  return orLater === undefined ? { license: id, plus: true } : { license: orLater };
}

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
    const license = token === undefined ? undefined : term(token);
    if (license === undefined || !take('WITH')) return license;
    const exception = exceptionIds.get(tokens[position++]?.toLowerCase() ?? '');
    return exception === undefined ? undefined : { ...license, exception };
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

/** Parses an SPDX license expression of listed ids and LicenseRefs (SPDX 2.3, Annex D); else undefined. */
export function parseSpdxExpression(value: string): SpdxExpression | undefined {
  if (value.length > 200 || !/^[A-Za-z0-9.+() -]*$/.test(value)) return undefined;
  return parse(value.match(/[()]|[^ ()]+/g) ?? []);
}

/** The one spelling of an expression: single spaces, listed case, parentheses only around an OR inside an AND. */
export function spdxText(expression: SpdxExpression): string {
  if ('license' in expression) {
    const exception = expression.exception === undefined ? '' : ` WITH ${expression.exception}`;
    return `${expression.license}${expression.plus === true ? '+' : ''}${exception}`;
  }
  return expression.parts
    .map((part) =>
      expression.operator === 'AND' && 'operator' in part && part.operator === 'OR'
        ? `(${spdxText(part)})`
        : spdxText(part),
    )
    .join(` ${expression.operator} `);
}

// A LicenseRef is text the item's author chooses, so a record names listed ids only; plus ids are written in the list.
const listed = (ids: readonly string[]) => ids.map((id) => id.replaceAll('.', '\\.')).join('|');
const plusIds = [...licenseIds.values()].filter((id) => !id.endsWith('+'));
// A plus follows only an id that has no -or-later id of its own and is not one.
const takesPlus = (id: string) => !versionScoped.test(id) && listedLicenseId(`${id}-or-later`) === undefined;
const listedTerm = `(?:(?:${listed(plusIds.filter(takesPlus))})\\+?|${listed(plusIds.filter((id) => !takesPlus(id)))})(?: WITH (?:${listed(spdxExceptionIds)}))?`;
const listedOperand = `\\(*${listedTerm}\\)*`;

/** An SPDX license expression such as `MIT OR Apache-2.0`; a single license id is one too. */
export const spdxExpression = z
  .string()
  .max(200)
  .regex(new RegExp(`^${listedOperand}(?: (?:AND|OR) ${listedOperand})*$`))
  .refine((value) => {
    const expression = parseSpdxExpression(value);
    return expression !== undefined && spdxText(expression) === value;
  }, 'an SPDX license expression of listed ids, in its one spelling')
  .describe(
    'An SPDX license expression (SPDX 2.3, Annex D) of SPDX License List ids and exception ids joined by AND, OR and WITH, in one spelling: single spaces, the case of the list, parentheses only around an OR inside an AND, and a plus id as its -or-later id where the list has one.',
  );
