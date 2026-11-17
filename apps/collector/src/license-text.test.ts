import { expect, it } from 'vitest';
import templates from './license-templates.json' with { type: 'json' };
import { licenseTextId } from './license-text.ts';

const variablePart = /<<var;name="([^"]*)";original="((?:[^"]|"(?!;match="))*)";match="(?:[^"]|"(?!>>))*">>/g;

// The Creative Commons 4.0 templates give an empty original for parts their patterns require; a license file has its
// copyright notice on a line of its own.
function filled(name: string, original: string): string {
  if (/^(?:copyright|©|\(c\))/i.test(original)) return `${original}\n`;
  if (name === 'ccLicensed') return 'CC-licensed';
  if (/^section\dTitleHyphens$/.test(name)) return '–';
  return original;
}

/** The license text a template writes with its optional parts and the original of each variable part. */
const textOf = (template: string) =>
  template
    .replace(/<<beginOptional>>|<<endOptional>>/g, '')
    .replace(variablePart, (_part, name: string, original: string) => filled(name, original));

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
  expect(licenseTextId(textOf(template))).toBe(id);
});

it('names a license whatever its copyright lines say, and without them', () => {
  expect([
    licenseTextId(mit('Copyright (c) 2024 Jane Doe. All rights reserved.')),
    licenseTextId(mit('Copyright © 2019-2025 Example Org and contributors\nCopyright 2018 A. Person')),
    licenseTextId(mit('')),
    licenseTextId(`${mit('')}\nCopyright (c) 2025 Example Org\n`),
  ]).toEqual(['MIT', 'MIT', 'MIT', 'MIT']);
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
    ].map((notice) => licenseTextId(mit(notice))),
  ).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
});

it('names no license for a title line that adds terms to the name', () => {
  const text = mit('Copyright (c) 2024 Jane Doe');
  expect([
    licenseTextId(text.replace('MIT License', 'MIT License (non-commercial use only)')),
    licenseTextId(text.replace('MIT License', 'Non-Commercial License')),
    licenseTextId(
      text.replace(
        'MIT License',
        'This license forbids commercial use\nThis license forbids military use\nThis license ends in 2027',
      ),
    ),
  ]).toEqual([undefined, undefined, undefined]);
});
