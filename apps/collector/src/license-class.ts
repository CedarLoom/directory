import { spdxId } from '@directory/contracts';

type LicenseClass = 'permissive' | 'copyleft' | 'source-available' | 'none';

/** A license id the class table does not hold; the item is refused rather than given a guessed class. */
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
  source?: 'github-detected' | 'frontmatter';
  class: LicenseClass;
}

function classOf(id: string): LicenseClass {
  // GPL-3.0-only and GPL-3.0-or-later share the class of GitHub's GPL-3.0.
  const found = classes[id.replace(/-(only|or-later)$/, '')];
  // The id is an SPDX id or GitHub's, never free text.
  if (found === undefined) throw new UnknownLicenseError(`no license class for ${id}`);
  return found;
}

/**
 * The item's license: a frontmatter value first, else GitHub's detected one.
 * A frontmatter value that is no SPDX id, such as a sentence, states terms of its own: class `none` without its text.
 */
export function licenseOf(detected: string | undefined, declared?: string): License {
  if (declared !== undefined)
    return spdxId.safeParse(declared).success
      ? { spdx: declared, source: 'frontmatter', class: classOf(declared) }
      : { source: 'frontmatter', class: 'none' };
  if (detected === undefined) return { class: 'none' };
  // NOASSERTION: GitHub found a license file it could not name.
  if (detected === 'NOASSERTION') return { source: 'github-detected', class: 'none' };
  return { spdx: detected, source: 'github-detected', class: classOf(detected) };
}
