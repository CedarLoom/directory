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

const holds = (name: string, type = 'blob') => holdsLicenseFile([{ name, type }]);

it('counts license files by name, but neither code named license nor a LICENSES folder', () => {
  expect([
    holds('LICENSE.txt'),
    holds('LICENSE-APACHE'),
    holds('COPYING.LESSER'),
    holds('license.js'),
    holds('LICENSES', 'tree'),
  ]).toEqual([true, true, true, false, false]);
});
