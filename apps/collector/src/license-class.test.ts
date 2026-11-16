import { expect, it } from 'vitest';
import { licenseOf } from './license-class.ts';

it('classes an SPDX id with an -only or -or-later suffix like its base id', () => {
  expect([licenseOf(undefined, 'GPL-3.0-or-later'), licenseOf(undefined, 'LGPL-2.1-only')]).toEqual([
    { spdx: 'GPL-3.0-or-later', source: 'frontmatter', class: 'copyleft' },
    { spdx: 'LGPL-2.1-only', source: 'frontmatter', class: 'copyleft' },
  ]);
});
