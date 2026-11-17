import { expect, it } from 'vitest';
import { holdsLicenseFile, licenseOf } from './license-class.ts';

it('classes an SPDX id with an -only or -or-later suffix like its base id', () => {
  expect([
    licenseOf(undefined, { declared: 'GPL-3.0-or-later' }),
    licenseOf(undefined, { declared: 'LGPL-2.1-only' }),
  ]).toEqual([
    { spdx: 'GPL-3.0-or-later', source: 'frontmatter', class: 'copyleft' },
    { spdx: 'LGPL-2.1-only', source: 'frontmatter', class: 'copyleft' },
  ]);
});

it('keeps a frontmatter license stated in words over the repository license, as class none without its text', () => {
  expect(licenseOf('MIT', { declared: 'Proprietary. LICENSE.txt has complete terms' })).toEqual({
    source: 'frontmatter',
    class: 'none',
  });
});

it('takes the root license over a manifest value and a manifest value over a folder license file', () => {
  expect([
    licenseOf('Apache-2.0', { manifest: 'MIT', folderLicenseFile: true }),
    licenseOf(undefined, { manifest: 'MIT', folderLicenseFile: true }),
    licenseOf(undefined, { manifest: 'See LICENSE', folderLicenseFile: true }),
  ]).toEqual([
    { spdx: 'Apache-2.0', source: 'github-detected', class: 'permissive' },
    { spdx: 'MIT', source: 'manifest', class: 'permissive' },
    { source: 'manifest', class: 'none' },
  ]);
});

const holds = (name: string, type = 'blob') => holdsLicenseFile([{ name, type }]);

it('counts license files by name, but neither code named license nor a LICENSES folder', () => {
  expect([
    holds('LICENSE.txt'),
    holds('LICENSE-APACHE'),
    holds('LICENSE-MIT.md'),
    holds('LICENSE-Apache-2.0.txt'),
    holds('COPYING.LESSER'),
    holds('license.js'),
    holds('LICENSES', 'tree'),
  ]).toEqual([true, true, true, true, true, false, false]);
});

it('counts neither third-party inventories nor scripts named after licenses', () => {
  expect([
    holds('LICENSE-vendor.js'),
    holds('license-node.txt'),
    holds('LICENSE-3rdparty.csv'),
    holds('LICENSE-THIRDPARTY'),
    holds('LICENSE-THIRD-PARTY.txt'),
    holds('license-check.js'),
    holds('license.json'),
  ]).toEqual([false, false, false, false, false, false, false]);
});

it('keeps a stated SPDX id the class table lacks as class none, in a manifest and a frontmatter', () => {
  expect([
    licenseOf(undefined, { manifest: 'Artistic-1.0' }),
    licenseOf(undefined, { declared: 'Artistic-1.0' }),
  ]).toEqual([
    { spdx: 'Artistic-1.0', source: 'manifest', class: 'none' },
    { spdx: 'Artistic-1.0', source: 'frontmatter', class: 'none' },
  ]);
});

it('classes an earlier version of a license like the version GitHub detects', () => {
  expect([
    licenseOf(undefined, { manifest: 'Apache-1.1' }),
    licenseOf(undefined, { declared: 'LGPL-2.0-only' }),
    licenseOf(undefined, { declared: 'CC-BY-NC-3.0' }),
  ]).toEqual([
    { spdx: 'Apache-1.1', source: 'manifest', class: 'permissive' },
    { spdx: 'LGPL-2.0-only', source: 'frontmatter', class: 'copyleft' },
    { spdx: 'CC-BY-NC-3.0', source: 'frontmatter', class: 'source-available' },
  ]);
});

it('reads a NONE or NOASSERTION manifest value as no manifest license', () => {
  expect([
    licenseOf(undefined, { manifest: 'NONE' }),
    licenseOf(undefined, { manifest: 'NOASSERTION', folderLicenseFile: true }),
  ]).toEqual([{ class: 'none' }, { source: 'license-file', class: 'none' }]);
});

it('counts LICENSE-<suffix> for a license family the class table holds, without a version', () => {
  expect(
    [
      'LICENSE-BUSL',
      'LICENSE-SSPL',
      'LICENSE-ELASTIC',
      'LICENSE-EUPL',
      'LICENSE-ARTISTIC',
      'LICENSE-OFL',
      'LICENSE-CDDL',
      'LICENSE-UPL',
      'LICENSE-AFL',
      'LICENSE-BSL',
      'LICENSE-CC-BY-SA',
      'LICENSE-CC-BY-NC.md',
      'LICENSE-ODBL',
    ].filter((name) => !holds(name)),
  ).toEqual([]);
});

it('reads a blank, UNLICENSED or proprietary manifest value as no manifest license', () => {
  expect([
    licenseOf(undefined, { manifest: ' ', folderLicenseFile: true }),
    licenseOf(undefined, { manifest: 'UNLICENSED' }),
    licenseOf(undefined, { manifest: 'unlicensed', folderLicenseFile: true }),
    licenseOf(undefined, { manifest: 'Proprietary' }),
    licenseOf(undefined, { manifest: 'PROPRIETARY', folderLicenseFile: true }),
  ]).toEqual([
    { source: 'license-file', class: 'none' },
    { class: 'none' },
    { source: 'license-file', class: 'none' },
    { class: 'none' },
    { source: 'license-file', class: 'none' },
  ]);
});

it('counts LICENSE-<suffix> for a full SPDX id, a license family with an optional version, or CODE', () => {
  expect(
    [
      'LICENSE-CODE',
      'LICENSE-APACHE2',
      'LICENSE-GPLv2',
      'LICENSE-GPLv3',
      'LICENSE-AGPLv3',
      'LICENSE-LGPL',
      'LICENSE-BSD',
      'LICENSE-MPL-2',
      'LICENSE-EPL',
      'LICENSE-ISC',
      'LICENSE-CC0',
      'LICENSE-CC-BY',
      'LICENSE-ZLIB',
      'LICENSE-UNLICENSE',
      'license-bsd-3-clause.txt',
      'LICENSE-openssl',
      'license-json.txt',
    ].filter((name) => !holds(name)),
  ).toEqual([]);
});

it('counts no LICENSE-<suffix> whose suffix is a generic word', () => {
  expect(
    [
      'LICENSE-check.txt',
      'LICENSE-any',
      'LICENSE-doc.md',
      'LICENSE-INFO.md',
      'LICENSE-CC.txt',
      'LICENSE-python.txt',
      'LICENSE-vendor',
      'LICENSE-THIRDPARTY',
    ].filter((name) => holds(name)),
  ).toEqual([]);
});
