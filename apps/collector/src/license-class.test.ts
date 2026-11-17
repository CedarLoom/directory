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
