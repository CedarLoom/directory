import { spdxId } from '@directory/contracts';

type LicenseClass = 'permissive' | 'copyleft' | 'source-available' | 'none';

/** A GitHub license id the class table does not hold; the item is refused rather than given a guessed class. */
export class UnknownLicenseError extends Error {
  override name = 'UnknownLicenseError';
}

// Every license GitHub detects (choosealicense.com's _licenses), plus source-available ids a frontmatter may declare.
const classes: Readonly<Record<string, LicenseClass>> = {
  ...Object.fromEntries(
    [
      '0BSD',
      'AFL-3.0',
      'Apache-2.0',
      'Artistic-2.0',
      'BlueOak-1.0.0',
      'BSD-2-Clause',
      'BSD-2-Clause-Patent',
      'BSD-3-Clause',
      'BSD-3-Clause-Clear',
      'BSD-4-Clause',
      'BSL-1.0',
      'CC-BY-4.0',
      'CC0-1.0',
      'CERN-OHL-P-2.0',
      'ECL-2.0',
      'ISC',
      'MIT',
      'MIT-0',
      'MS-PL',
      'MulanPSL-2.0',
      'NCSA',
      'PostgreSQL',
      'Unlicense',
      'UPL-1.0',
      'WTFPL',
      'Zlib',
    ].map((id) => [id, 'permissive']),
  ),
  ...Object.fromEntries(
    [
      'AGPL-3.0',
      'CC-BY-SA-4.0',
      'CECILL-2.1',
      'CERN-OHL-S-2.0',
      'CERN-OHL-W-2.0',
      'EPL-1.0',
      'EPL-2.0',
      'EUPL-1.1',
      'EUPL-1.2',
      'GFDL-1.3',
      'GPL-2.0',
      'GPL-3.0',
      'LGPL-2.1',
      'LGPL-3.0',
      'LPPL-1.3c',
      'MPL-2.0',
      'MS-RL',
      'ODbL-1.0',
      'OFL-1.1',
      'OSL-3.0',
      'Vim',
    ].map((id) => [id, 'copyleft']),
  ),
  ...Object.fromEntries(
    [
      'BUSL-1.1',
      'CC-BY-NC-4.0',
      'CC-BY-NC-ND-4.0',
      'CC-BY-NC-SA-4.0',
      'CC-BY-ND-4.0',
      'Elastic-2.0',
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
}

// LICENSE-MIT, COPYING.LESSER or UNLICENSE count; a file such as license.js is code, not a license.
const licenseFileName =
  /^(?:(?:un)?licen[cs]e|copying(?:\.lesser)?|licen[cs]e-(?<id>.+?))(?:\.(?:md|markdown|txt|rst|html))?$/i;
// LICENSE-DOC holds the terms of the documentation, not the DOC license.
const licenseIds: ReadonlySet<string> = new Set(
  spdxId.options.filter((id) => id !== 'DOC').map((id) => id.toLowerCase()),
);
// A family with an optional version, as in LICENSE-APACHE2 or LICENSE-GPLv3, or LICENSE-CODE; LICENSE-INFO is none.
const licenseSuffix =
  /^(?:(?:mit|apache|bsd|[al]?gpl|mpl|epl|isc|cc0|cc-by|zlib|unlicense)(?:-?v?\d+(?:\.\d+)*)?|code)$/i;

function isLicenseFileName(name: string): boolean {
  const match = licenseFileName.exec(name);
  if (match === null) return false;
  const id = match.groups?.['id'];
  return id === undefined || licenseIds.has(id.toLowerCase()) || licenseSuffix.test(id);
}

/** Whether a folder listing holds a license file. */
export function holdsLicenseFile(entries: readonly { name: string; type: string }[] | undefined): boolean {
  return entries?.some(({ name, type }) => type === 'blob' && isLicenseFileName(name)) ?? false;
}

function knownClass(id: string): LicenseClass | undefined {
  // GPL-3.0-only and GPL-3.0-or-later share the class of GitHub's GPL-3.0.
  return classes[id.replace(/-(only|or-later)$/, '')];
}

function classOf(id: string): LicenseClass {
  const found = knownClass(id);
  // The id is GitHub's, never free text.
  if (found === undefined) throw new UnknownLicenseError(`no license class for ${id}`);
  return found;
}

// A stated value that is no SPDX id, such as a sentence, states terms of its own: class `none` without its text.
// An SPDX id the class table lacks, such as Apache-1.1, keeps its id with class `none` rather than refusing the item.
function stated(value: string, source: 'manifest' | 'frontmatter'): License {
  return spdxId.safeParse(value).success
    ? { spdx: value, source, class: knownClass(value) ?? 'none' }
    : { source, class: 'none' };
}

// A blank value, npm's UNLICENSED or proprietary grants no license, so the manifest states none.
const grantsNoLicense = /^\s*(?:unlicensed|proprietary)?\s*$/i;

/**
 * The item's license: a frontmatter value first, else GitHub's detected one, else a plugin manifest value, else a
 * license file in the item's folder.
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
  if (declared !== undefined) return stated(declared, 'frontmatter');
  if (detected === undefined) {
    if (manifest !== undefined && !grantsNoLicense.test(manifest)) return stated(manifest, 'manifest');
    return folderLicenseFile ? { source: 'license-file', class: 'none' } : { class: 'none' };
  }
  // NOASSERTION: GitHub found a license file it could not name.
  if (detected === 'NOASSERTION') return { source: 'github-detected', class: 'none' };
  return { spdx: detected, source: 'github-detected', class: classOf(detected) };
}
