import { expect, it } from 'vitest';
import templates from './license-templates.json' with { type: 'json' };
import { licenseTextId } from './license-text.ts';
import { templateLicenseText } from './template-license-text.ts';

const mit = (notice: string) => `MIT License

${notice}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

it.each(Object.entries(templates))('names %s from its license text', (id, template) => {
  expect(licenseTextId(templateLicenseText(template))).toBe(id);
});

it('names a license whatever its copyright lines say, and without them', () => {
  expect([
    licenseTextId(mit('Copyright (c) 2024 Jane Doe. All rights reserved.')),
    licenseTextId(mit('Copyright © 2019-2025 Example Org and contributors\nCopyright 2018 A. Person')),
    licenseTextId(mit('')),
    licenseTextId(`${mit('')}\nCopyright (c) 2025 Example Org\n`),
  ]).toEqual(['MIT', 'MIT', 'MIT', 'MIT']);
});

it('names a license whose copyright notice wraps onto a second line, unless that line adds terms', () => {
  expect([
    licenseTextId(
      mit('Copyright (c) 1991 - 1995, Example Research Institute Amsterdam,\nThe Netherlands. All rights reserved.'),
    ),
    licenseTextId(
      mit('Copyright (C) 1991 Free Software Foundation, Inc.\n51 Franklin St, Fifth Floor, Boston, MA 02110-1301, USA'),
    ),
    licenseTextId(mit('Copyright (c) 2024 Jane Doe and the\nExample Project contributors')),
    licenseTextId(mit('Copyright (c) 2009 Example Corp.\nMountain View, California')),
    licenseTextId(mit('Copyright (c) 2024 Jane Doe\n2 Main Street, Springfield')),
    licenseTextId(mit('Copyright (c) 2024 Jane Doe,\nfor non-commercial use only')),
    licenseTextId(mit('Copyright (c) 2024 Acme Corp and\nits affiliates. Proprietary and confidential.')),
  ]).toEqual(['MIT', 'MIT', 'MIT', 'MIT', 'MIT', undefined, undefined]);
});

it('names no license for a sentence of terms on the line after a copyright notice', () => {
  const gpl = templateLicenseText(templates['GPL-2.0']);
  expect([
    ...[
      'Copyright (c) 2024 Jane Doe\nFor personal and educational use',
      'Copyright (c) 2024 Jane Doe.\nAuthor liability is unlimited',
      'Copyright (c) 2024 Jane Doe\nUse is subject to the terms at example.com/terms',
      'Copyright (c) 2024 Jane Doe\nNo use by companies with more than ten employees',
      'Copyright (c) 2024 Jane Doe\nAI training is banned',
      'Copyright (c) 2024 Acme Inc.\nFor Personal Use',
      'Copyright (c) 2024 Jane Doe\n10 Users Maximum',
    ].map((notice) => licenseTextId(mit(notice))),
    licenseTextId(gpl.replace(/^51 Franklin Street.*$/m, 'For personal and educational use')),
    licenseTextId(gpl.replace(/^51 Franklin Street.*$/m, 'For Personal And Educational Use')),
  ]).toEqual(Array.from({ length: 9 }, () => undefined));
});

it('names GPL-2.0 when a blank line sets its address apart from its copyright line', () => {
  const text = templateLicenseText(templates['GPL-2.0']).replace('Inc. \n51 Franklin', 'Inc.\n\n51 Franklin');
  expect(licenseTextId(text)).toBe('GPL-2.0');
});

it('names a license whatever the case or script of its holder', () => {
  expect(
    [
      'Copyright 2024 foo contributors',
      'Copyright (c) 2015 - present Microsoft Corporation',
      'Copyright (c) 2026 Browser Use',
      'Copyright (c) 2024 shareAI Lab',
      'Copyright (c) 2026 数字生命卡兹克',
      'Copyright (c) 2026 alchaincyf (花叔 · 花生)',
      'Copyright (c) 2026 jnMetaCode (Chinese translation and localization)',
    ].map((notice) => licenseTextId(mit(notice))),
  ).toEqual(['MIT', 'MIT', 'MIT', 'MIT', 'MIT', 'MIT', 'MIT']);
});

it('names no license for a text that changes, adds or leaves out a term', () => {
  const text = mit('Copyright (c) 2024 Jane Doe');
  expect([
    licenseTextId(text.replace('without restriction', 'with restriction')),
    licenseTextId(text.replace('sublicense, and/or sell', 'and/or sublicense')),
    licenseTextId(`${text}\nThe Software shall be used for Good, not Evil.\n`),
    licenseTextId(text.replace(/^The above copyright notice[^]*?Software\.\n/m, '')),
  ]).toEqual([undefined, undefined, undefined, undefined]);
});

it('names no license for a text that adds terms before it or on its copyright line', () => {
  expect([
    licenseTextId(`Non-commercial use only. Commercial use is prohibited.\n\n${mit('Copyright (c) 2024 Jane Doe')}`),
    licenseTextId(mit('Copyright (c) 2024 Jane Doe. Not for commercial use.')),
    licenseTextId(`No military use.\n${mit('')}`),
  ]).toEqual([undefined, undefined, undefined]);
});

it('names no license for a copyright line that adds terms after its holder', () => {
  expect(
    [
      'Copyright (c) 2024 Jane Doe, for non-commercial use only',
      'Copyright (c) 2024 Jane Doe, Non-Commercial Use Only',
      'Copyright 2024 Jane Doe - commercial use is prohibited',
      '© 2024 Jane Doe (personal use only)',
      'Copyright 2024 X; no commercial use',
      '(c) 2024 Commercial use requires a paid license from Jane Doe',
      'Copyright (c) 2024 Acme Corp - Proprietary and Confidential',
      'Copyright (c) 2024 Acme Corp, confidential',
      'Copyright (c) 2024 Jane Doe - Evaluation Copy',
      'Copyright (c) 2024 Jane Doe - Expires 2027',
      'Copyright (c) 2024 Jane Doe - NC',
    ].map((notice) => licenseTextId(mit(notice))),
  ).toEqual(Array.from({ length: 11 }, () => undefined));
});

it('names no license for a title line that adds terms to the name', () => {
  const text = mit('Copyright (c) 2024 Jane Doe');
  expect([
    licenseTextId(text.replace('MIT License', 'MIT License (non-commercial use only)')),
    licenseTextId(text.replace('MIT License', 'Non-Commercial License')),
    // The words of another license's title.
    licenseTextId(text.replace('MIT License', 'CC BY-NC-SA 4.0')),
    licenseTextId(
      text.replace(
        'MIT License',
        'This license forbids commercial use\nThis license forbids military use\nThis license ends in 2027',
      ),
    ),
  ]).toEqual([undefined, undefined, undefined, undefined]);
});
