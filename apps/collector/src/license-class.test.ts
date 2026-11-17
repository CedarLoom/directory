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
  expect(licenseOf('MIT', { declared: 'See LICENSE.txt for the complete terms' })).toEqual({
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
    licenseOf(undefined, { manifest: 'Unicode-3.0' }),
    licenseOf(undefined, { declared: 'Unicode-3.0' }),
  ]).toEqual([
    { spdx: 'Unicode-3.0', source: 'manifest', class: 'none' },
    { spdx: 'Unicode-3.0', source: 'frontmatter', class: 'none' },
  ]);
});

it('classes an earlier version of a license like the version GitHub detects', () => {
  expect([
    licenseOf(undefined, { manifest: 'Apache-1.1' }),
    licenseOf(undefined, { declared: 'LGPL-2.0-only' }),
    licenseOf(undefined, { declared: 'CC-BY-NC-3.0' }),
    licenseOf(undefined, { manifest: 'Artistic-1.0' }),
    licenseOf(undefined, { manifest: 'AFL-2.1' }),
    licenseOf(undefined, { declared: 'OSL-2.0' }),
    licenseOf(undefined, { declared: 'GFDL-1.3-invariants-or-later' }),
  ]).toEqual([
    { spdx: 'Apache-1.1', source: 'manifest', class: 'permissive' },
    { spdx: 'LGPL-2.0-only', source: 'frontmatter', class: 'copyleft' },
    { spdx: 'CC-BY-NC-3.0', source: 'frontmatter', class: 'source-available' },
    { spdx: 'Artistic-1.0', source: 'manifest', class: 'permissive' },
    { spdx: 'AFL-2.1', source: 'manifest', class: 'permissive' },
    { spdx: 'OSL-2.0', source: 'frontmatter', class: 'copyleft' },
    { spdx: 'GFDL-1.3-invariants-or-later', source: 'frontmatter', class: 'copyleft' },
  ]);
});

it('reads a NOASSERTION field as no license stated there, leaving the folder license file and not the root license', () => {
  expect([
    licenseOf('MIT', { manifest: 'NOASSERTION', folderLicenseFile: true }),
    licenseOf('MIT', { declared: 'noassertion' }),
  ]).toEqual([{ source: 'license-file', class: 'none' }, { class: 'none' }]);
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

it('reads a blank field as none, so the root license or the folder license file decides', () => {
  expect([
    licenseOf('MIT', { declared: ' ' }),
    licenseOf(undefined, { manifest: ' ', folderLicenseFile: true }),
  ]).toEqual([
    { spdx: 'MIT', source: 'github-detected', class: 'permissive' },
    { source: 'license-file', class: 'none' },
  ]);
});

it('reads an UNLICENSED, NONE or proprietary manifest value as withheld, over the root license', () => {
  expect([
    licenseOf('MIT', { manifest: 'UNLICENSED', folderLicenseFile: true }),
    licenseOf(undefined, { manifest: 'none' }),
    licenseOf('Apache-2.0', { manifest: 'PROPRIETARY' }),
  ]).toEqual([
    { source: 'manifest', class: 'none', withheld: true },
    { source: 'manifest', class: 'none', withheld: true },
    { source: 'manifest', class: 'none', withheld: true },
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
      'LICENSE-UNLICENSE',
      'license-bsd-3-clause.txt',
      'LICENSE-GPL-3.0-or-later',
      'LICENSE-Python-2.0.txt',
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

it('counts no LICENSE-<suffix> whose suffix is an SPDX id the class table lacks, such as a vendored notice', () => {
  expect(
    ['LICENSE-openssl', 'license-json.txt', 'LICENSE-curl', 'LICENSE-ICU', 'LICENSE-Unicode-3.0'].filter((name) =>
      holds(name),
    ),
  ).toEqual([]);
});

it('classes the Python and PSF licenses as permissive', () => {
  expect([licenseOf(undefined, { manifest: 'Python-2.0' }), licenseOf(undefined, { declared: 'PSF-2.0' })]).toEqual([
    { spdx: 'Python-2.0', source: 'manifest', class: 'permissive' },
    { spdx: 'PSF-2.0', source: 'frontmatter', class: 'permissive' },
  ]);
});

it('stores a deprecated plus id as its -or-later id', () => {
  expect([licenseOf(undefined, { manifest: 'GPL-2.0+' }), licenseOf(undefined, { declared: 'LGPL-2.1+' })]).toEqual([
    { spdx: 'GPL-2.0-or-later', source: 'manifest', class: 'copyleft' },
    { spdx: 'LGPL-2.1-or-later', source: 'frontmatter', class: 'copyleft' },
  ]);
});

it('classes an SPDX expression by its most permissive OR part and its least permissive AND part', () => {
  expect([
    licenseOf(undefined, { manifest: 'MIT OR Apache-2.0' }),
    licenseOf(undefined, { manifest: 'GPL-3.0-only OR LicenseRef-Commercial' }),
    licenseOf(undefined, { declared: 'MIT AND (GPL-2.0+ OR BUSL-1.1)' }),
    licenseOf(undefined, { declared: 'MIT AND LicenseRef-Custom' }),
    licenseOf(undefined, { declared: 'GPL-2.0-only WITH Classpath-exception-2.0' }),
    licenseOf(undefined, { declared: 'MIT WITH No-commercial-use' }),
  ]).toEqual([
    { spdx: 'MIT OR Apache-2.0', source: 'manifest', class: 'permissive' },
    { source: 'manifest', class: 'copyleft' },
    { spdx: 'MIT AND (GPL-2.0-or-later OR BUSL-1.1)', source: 'frontmatter', class: 'copyleft' },
    { source: 'frontmatter', class: 'none' },
    { spdx: 'GPL-2.0-only WITH Classpath-exception-2.0', source: 'frontmatter', class: 'copyleft' },
    { source: 'frontmatter', class: 'none' },
  ]);
});

it('reads an UNLICENSED or proprietary frontmatter value as withheld, not as the repository license', () => {
  expect([
    licenseOf('MIT', { declared: 'UNLICENSED' }),
    licenseOf('MIT', { declared: 'proprietary' }),
    licenseOf('MIT', { declared: 'Proprietary. LICENSE.txt has complete terms' }),
  ]).toEqual([
    { source: 'frontmatter', class: 'none', withheld: true },
    { source: 'frontmatter', class: 'none', withheld: true },
    { source: 'frontmatter', class: 'none', withheld: true },
  ]);
});

it('stores a stated expression in one spelling, its ids in the listed case', () => {
  expect([
    licenseOf(undefined, { manifest: '(mit)' }),
    licenseOf(undefined, { declared: 'MIT  OR  apache-2.0' }),
    licenseOf(undefined, { declared: '(MIT AND ISC) AND (0BSD OR gpl-3.0+)' }),
  ]).toEqual([
    { spdx: 'MIT', source: 'manifest', class: 'permissive' },
    { spdx: 'MIT OR Apache-2.0', source: 'frontmatter', class: 'permissive' },
    { spdx: 'MIT AND ISC AND (0BSD OR GPL-3.0-or-later)', source: 'frontmatter', class: 'permissive' },
  ]);
});

it('counts LICENSE-<suffix> for a listed -only id, but not for an -only suffix to an id the list lacks', () => {
  expect([holds('LICENSE-GPL-3.0-only'), holds('license-lgpl-2.1-only.txt'), holds('LICENSE-MIT-only')]).toEqual([
    true,
    true,
    false,
  ]);
});

it('counts no LICENSE-<suffix> for an id the class table lacks or for software named like its license', () => {
  expect(
    ['LICENSE-X11', 'LICENSE-HPND', 'LICENSE-zlib', 'LICENSE-ZLIB', 'LICENSE-vim', 'LICENSE-postgresql'].filter(
      (name) => holds(name),
    ),
  ).toEqual([]);
});
