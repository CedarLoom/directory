import {
  type ItemRecord,
  listedLicenseId,
  parseSpdxExpression,
  type SpdxExpression,
  spdxExpression,
  spdxText,
} from '@directory/contracts';
import { licenseNameId } from './license-name.ts';
import { licenseTextId } from './license-text.ts';

type LicenseClass = 'permissive' | 'copyleft' | 'source-available' | 'none';

/** A GitHub license id the class table does not hold; the item is refused rather than given a guessed class. */
export class UnknownLicenseError extends Error {
  override name = 'UnknownLicenseError';
}

// Every license GitHub detects (choosealicense.com's _licenses), their earlier versions and other ids an item states.
const classes: Readonly<Record<string, LicenseClass>> = {
  ...Object.fromEntries(
    [
      '0BSD',
      'AFL-1.1',
      'AFL-1.2',
      'AFL-2.0',
      'AFL-2.1',
      'AFL-3.0',
      'Apache-1.0',
      'Apache-1.1',
      'Apache-2.0',
      'Artistic-1.0',
      'Artistic-1.0-cl8',
      'Artistic-1.0-Perl',
      'Artistic-2.0',
      'BlueOak-1.0.0',
      'BSD-1-Clause',
      'BSD-2-Clause',
      'BSD-2-Clause-Patent',
      'BSD-3-Clause',
      'BSD-3-Clause-Clear',
      'BSD-4-Clause',
      'BSL-1.0',
      'CC-BY-1.0',
      'CC-BY-2.0',
      'CC-BY-2.5',
      'CC-BY-3.0',
      'CC-BY-4.0',
      'CC0-1.0',
      'CERN-OHL-P-2.0',
      'ECL-1.0',
      'ECL-2.0',
      'ISC',
      'MIT',
      'MIT-0',
      'MS-PL',
      'MulanPSL-1.0',
      'MulanPSL-2.0',
      'NCSA',
      'PostgreSQL',
      'PSF-2.0',
      'Python-2.0',
      'Python-2.0.1',
      'Unlicense',
      'UPL-1.0',
      'WTFPL',
      'Zlib',
    ].map((id) => [id, 'permissive']),
  ),
  ...Object.fromEntries(
    [
      'AGPL-1.0',
      'AGPL-3.0',
      'CC-BY-SA-1.0',
      'CC-BY-SA-2.0',
      'CC-BY-SA-2.5',
      'CC-BY-SA-3.0',
      'CC-BY-SA-4.0',
      'CDDL-1.0',
      'CDDL-1.1',
      'CECILL-1.0',
      'CECILL-1.1',
      'CECILL-2.0',
      'CECILL-2.1',
      'CERN-OHL-S-2.0',
      'CERN-OHL-W-2.0',
      'EPL-1.0',
      'EPL-2.0',
      'EUPL-1.0',
      'EUPL-1.1',
      'EUPL-1.2',
      'GFDL-1.1',
      'GFDL-1.1-invariants',
      'GFDL-1.1-no-invariants',
      'GFDL-1.2',
      'GFDL-1.2-invariants',
      'GFDL-1.2-no-invariants',
      'GFDL-1.3',
      'GFDL-1.3-invariants',
      'GFDL-1.3-no-invariants',
      'GPL-1.0',
      'GPL-2.0',
      'GPL-2.0-with-autoconf-exception',
      'GPL-2.0-with-bison-exception',
      'GPL-2.0-with-classpath-exception',
      'GPL-2.0-with-font-exception',
      'GPL-2.0-with-GCC-exception',
      'GPL-3.0',
      'GPL-3.0-with-autoconf-exception',
      'GPL-3.0-with-GCC-exception',
      'LGPL-2.0',
      'LGPL-2.1',
      'LGPL-3.0',
      'LPPL-1.0',
      'LPPL-1.1',
      'LPPL-1.2',
      'LPPL-1.3a',
      'LPPL-1.3c',
      'MPL-1.0',
      'MPL-1.1',
      'MPL-2.0',
      'MS-RL',
      'ODbL-1.0',
      'OFL-1.0',
      'OFL-1.1',
      'OSL-1.0',
      'OSL-1.1',
      'OSL-2.0',
      'OSL-2.1',
      'OSL-3.0',
      'Vim',
    ].map((id) => [id, 'copyleft']),
  ),
  ...Object.fromEntries(
    [
      'BUSL-1.1',
      'CC-BY-NC-1.0',
      'CC-BY-NC-2.0',
      'CC-BY-NC-2.5',
      'CC-BY-NC-3.0',
      'CC-BY-NC-4.0',
      'CC-BY-NC-ND-1.0',
      'CC-BY-NC-ND-2.0',
      'CC-BY-NC-ND-2.5',
      'CC-BY-NC-ND-3.0',
      'CC-BY-NC-ND-4.0',
      'CC-BY-NC-SA-1.0',
      'CC-BY-NC-SA-2.0',
      'CC-BY-NC-SA-2.5',
      'CC-BY-NC-SA-3.0',
      'CC-BY-NC-SA-4.0',
      'CC-BY-ND-1.0',
      'CC-BY-ND-2.0',
      'CC-BY-ND-2.5',
      'CC-BY-ND-3.0',
      'CC-BY-ND-4.0',
      'Elastic-2.0',
      'FSL-1.1-ALv2',
      'FSL-1.1-MIT',
      'PolyForm-Noncommercial-1.0.0',
      'PolyForm-Small-Business-1.0.0',
      'SSPL-1.0',
    ].map((id) => [id, 'source-available']),
  ),
};

export type License = ItemRecord['license'];

// LICENSE-MIT, COPYING.LESSER or UNLICENSE count; a file such as license.js is code, not a license.
const licenseFileName =
  /^(?:(?:un)?licen[cs]e|copying(?:\.lesser)?|licen[cs]e-(?<id>.+?))(?:\.(?:md|markdown|txt|rst|html))?$/i;
const onlyOrLater = /-(?:only|or-later)$/;
// Software named like its license: LICENSE-zlib or LICENSE-python is mostly the notice of a vendored copy.
const vendoredNotices: ReadonlySet<string> = new Set(['python', 'zlib', 'vim', 'postgresql']);
// A family is a class table id without its version: LICENSE-BUSL counts, LICENSE-INFO does not.
const licenseFamilies: ReadonlySet<string> = new Set(
  Object.keys(classes)
    .map((id) => id.replace(/-\d.*$/, '').toLowerCase())
    .filter((family) => !vendoredNotices.has(family)),
);
// A family may carry a version of its own, as in LICENSE-APACHE2 or LICENSE-GPLv3.
const familyVersion = /-?v?\d+(?:\.\d+)*$/;

// A full SPDX id counts when the class table holds it: LICENSE-openssl or LICENSE-curl is mostly a vendored notice.
function isTableId(suffix: string): boolean {
  const id = listedLicenseId(suffix);
  return id !== undefined && !vendoredNotices.has(id.toLowerCase()) && knownClass(id) !== undefined;
}

function isLicenseFileName(name: string): boolean {
  const match = licenseFileName.exec(name);
  if (match === null) return false;
  const suffix = match.groups?.['id'];
  if (suffix === undefined) return true;
  const lowerCase = suffix.toLowerCase();
  return (
    lowerCase === 'code' ||
    isTableId(suffix) ||
    licenseFamilies.has(lowerCase) ||
    licenseFamilies.has(lowerCase.replace(familyVersion, ''))
  );
}

/** The license files of a folder listing. */
export function licenseFileNames(entries: readonly { name: string; type: string }[] | undefined): string[] {
  return entries?.filter(({ name, type }) => type === 'blob' && isLicenseFileName(name)).map(({ name }) => name) ?? [];
}

function knownClass(id: string): LicenseClass | undefined {
  // GPL-3.0-only and GPL-3.0-or-later share the class of GitHub's GPL-3.0.
  return classes[id.replace(onlyOrLater, '')];
}

function classOf(id: string): LicenseClass {
  const found = knownClass(id);
  // The id is GitHub's or a matched template's, never free text.
  if (found === undefined) throw new UnknownLicenseError(`no license class for ${id}`);
  return found;
}

const permissiveness: Readonly<Record<LicenseClass, number>> = {
  none: 0,
  'source-available': 1,
  copyleft: 2,
  permissive: 3,
};

// An OR lets the user pick a part, so its most permissive part counts; an AND binds every part, so its least.
function expressionClass(expression: SpdxExpression): LicenseClass {
  if ('license' in expression) return knownClass(expression.license) ?? 'none';
  const kept =
    expression.operator === 'OR'
      ? (a: LicenseClass, b: LicenseClass) => (permissiveness[a] >= permissiveness[b] ? a : b)
      : (a: LicenseClass, b: LicenseClass) => (permissiveness[a] <= permissiveness[b] ? a : b);
  return expression.parts.map(expressionClass).reduce(kept);
}

// A license's full name, such as MIT License, states its id.
function statedExpression(value: string): SpdxExpression | undefined {
  const expression = parseSpdxExpression(value.trim());
  if (expression !== undefined) return expression;
  const named = licenseNameId(value);
  return named === undefined ? undefined : { license: named };
}

// A stated value that is neither an SPDX expression nor a license's name, such as a sentence, states terms of its own:
// class `none` without its text. An SPDX id the class table lacks, such as Unicode-3.0, keeps its id with class `none`
// rather than refusing the item.
function stated(value: string, source: 'manifest' | 'frontmatter'): License {
  const expression = statedExpression(value);
  if (expression === undefined) return { source, class: 'none' };
  const spdx = spdxText(expression);
  const licenseClass = expressionClass(expression);
  // A LicenseRef is the author's own text, which a record does not copy, nor is an expression whose spelling exceeds the contract's length.
  return spdxExpression.safeParse(spdx).success
    ? { spdx, source, class: licenseClass }
    : { source, class: licenseClass };
}

// npm's UNLICENSED, SPDX's NONE or the bare word proprietary grants no license; a sentence that starts with it is a license of its own.
const withholdsLicense = /^\s*(?:unlicensed|none|proprietary\.?)\s*$/i;
// A blank value and SPDX's NOASSERTION, which implies no meaning (SPDX 2.3), state nothing: the next source applies.
const statesNothing = /^\s*(?:noassertion\s*)?$/i;

const given = (value: string | undefined): value is string => value !== undefined && !statesNothing.test(value);

/** Whether a license field has a value that is neither blank, NOASSERTION nor a withholding word; its text is not read. */
export function isLicenseValue(value: string): boolean {
  return given(value) && !withholdsLicense.test(value);
}

const withholds = (value: string | undefined): boolean => given(value) && withholdsLicense.test(value);

// The field that decides over GitHub's detection: any frontmatter value, or a manifest value that withholds the license.
function ownField(
  declared: string | undefined,
  manifest: string | undefined,
): { value: string; source: 'manifest' | 'frontmatter' } | undefined {
  if (given(declared)) return { value: declared, source: 'frontmatter' };
  return given(manifest) && withholdsLicense.test(manifest) ? { value: manifest, source: 'manifest' } : undefined;
}

// A license file whose text matches an SPDX license.
function namedFile(text: string | undefined): License | undefined {
  const id = text === undefined ? undefined : licenseTextId(text);
  return id === undefined ? undefined : { spdx: id, source: 'license-file', class: classOf(id) };
}

// The repository's license does not cover an item its plugin withholds; only a license file in the item's own folder can.
function withheldByContainer(
  container: string | undefined,
  folderLicense: () => License | undefined,
  containerFolder: boolean | undefined,
): License | undefined {
  if (!withholds(container)) return undefined;
  return (
    (containerFolder === true ? undefined : folderLicense()) ?? { source: 'manifest', class: 'none', withheld: true }
  );
}

function detectedOrStated(
  detected: string | undefined,
  manifest: string | undefined,
  folderLicense: () => License | undefined,
  rootLicenseText: string | undefined,
): License {
  if (detected !== undefined && detected !== 'NOASSERTION')
    return { spdx: detected, source: 'github-detected', class: classOf(detected) };
  if (given(manifest)) return stated(manifest, 'manifest');
  // NOASSERTION: GitHub found a license file it could not name, which says less than a manifest value.
  if (detected === 'NOASSERTION') return namedFile(rootLicenseText) ?? { source: 'github-detected', class: 'none' };
  return folderLicense() ?? { class: 'none' };
}

/**
 * The item's license: a frontmatter value first, else a manifest value that withholds the license, else, when the
 * containing plugin's manifest value (`container`) withholds it, a license file in the item's folder unless that is the
 * plugin's folder (`containerFolder`), or that withheld value, else GitHub's detected one, else a manifest value, else a
 * license file in the item's folder, which GitHub does not name, as it reads the root only: by its text
 * (`folderLicenseText`) when that matches an SPDX license. A root license file GitHub cannot name (NOASSERTION) comes
 * after the manifest value, named by its text (`rootLicenseText`) when that matches an SPDX license.
 */
export function licenseOf(
  detected: string | undefined,
  {
    declared,
    manifest,
    container,
    containerFolder,
    folderLicenseFile = false,
    folderLicenseText,
    rootLicenseText,
  }: {
    declared?: string | undefined;
    manifest?: string | undefined;
    container?: string | undefined;
    containerFolder?: boolean | undefined;
    folderLicenseFile?: boolean;
    folderLicenseText?: string | undefined;
    rootLicenseText?: string | undefined;
  } = {},
): License {
  const own = ownField(declared, manifest);
  if (own !== undefined) {
    const { value, source } = own;
    return withholdsLicense.test(value) ? { source, class: 'none', withheld: true } : stated(value, source);
  }
  // Matching a text takes milliseconds, so only a license the record uses is matched.
  const folderLicense = (): License | undefined =>
    folderLicenseFile ? (namedFile(folderLicenseText) ?? { source: 'license-file', class: 'none' }) : undefined;
  const inherited = withheldByContainer(container, folderLicense, containerFolder);
  if (inherited !== undefined) return inherited;
  return detectedOrStated(detected, manifest, folderLicense, rootLicenseText);
}
