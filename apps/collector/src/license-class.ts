import {
  listedLicenseId,
  parseSpdxExpression,
  type SpdxExpression,
  spdxExpression,
  spdxText,
} from '@directory/contracts';

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

export interface License {
  spdx?: string;
  source?: 'github-detected' | 'manifest' | 'frontmatter' | 'license-file';
  class: LicenseClass;
  withheld?: true;
}

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

/** Whether a folder listing holds a license file. */
export function holdsLicenseFile(entries: readonly { name: string; type: string }[] | undefined): boolean {
  return entries?.some(({ name, type }) => type === 'blob' && isLicenseFileName(name)) ?? false;
}

function knownClass(id: string): LicenseClass | undefined {
  // GPL-3.0-only and GPL-3.0-or-later share the class of GitHub's GPL-3.0.
  return classes[id.replace(onlyOrLater, '')];
}

function classOf(id: string): LicenseClass {
  const found = knownClass(id);
  // The id is GitHub's, never free text.
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

// A stated value that is no SPDX expression, such as a sentence, states terms of its own: class `none` without its text.
// An SPDX id the class table lacks, such as Unicode-3.0, keeps its id with class `none` rather than refusing the item.
function stated(value: string, source: 'manifest' | 'frontmatter'): License {
  const expression = parseSpdxExpression(value.trim());
  if (expression === undefined) return { source, class: 'none' };
  const spdx = spdxText(expression);
  const licenseClass = expressionClass(expression);
  // A LicenseRef is the author's own text, which a record does not copy.
  return spdxExpression.safeParse(spdx).success
    ? { spdx, source, class: licenseClass }
    : { source, class: licenseClass };
}

// npm's UNLICENSED, SPDX's NONE, proprietary or a sentence that starts with it grants no license.
const withholdsLicense = /^\s*(?:unlicensed\s*|none\s*|proprietary\b[\s\S]*)$/i;
// SPDX's NOASSERTION states nothing about the license, nor does a blank value.
const assertsNothing = /^\s*(?:noassertion)?\s*$/i;

const given = (value: string | undefined): value is string => value !== undefined && value.trim() !== '';

/** Whether a license field grants a license: it neither withholds one nor asserts nothing. */
export function grantsLicense(value: string): boolean {
  return !withholdsLicense.test(value) && !assertsNothing.test(value);
}

/**
 * The item's license: a frontmatter value first, else a plugin manifest value that withholds the license, else GitHub's
 * detected one, else a manifest value that grants one, else a license file in the item's folder.
 * A NOASSERTION field states no license, so a license file in the item's folder decides, not the repository's.
 * A license file in the item's folder is not named, as GitHub detects licenses at the repository root only.
 */
export function licenseOf(
  detected: string | undefined,
  {
    declared,
    manifest,
    folderLicenseFile = false,
  }: { declared?: string | undefined; manifest?: string | undefined; folderLicenseFile?: boolean } = {},
): License {
  const inFolder: License = folderLicenseFile ? { source: 'license-file', class: 'none' } : { class: 'none' };
  const own = (value: string, source: 'manifest' | 'frontmatter'): License => {
    if (withholdsLicense.test(value)) return { source, class: 'none', withheld: true };
    return assertsNothing.test(value) ? inFolder : stated(value, source);
  };
  if (given(declared)) return own(declared, 'frontmatter');
  if (given(manifest) && !grantsLicense(manifest)) return own(manifest, 'manifest');
  if (detected === undefined) return given(manifest) ? stated(manifest, 'manifest') : inFolder;
  // NOASSERTION: GitHub found a license file it could not name.
  if (detected === 'NOASSERTION') return { source: 'github-detected', class: 'none' };
  return { spdx: detected, source: 'github-detected', class: classOf(detected) };
}
