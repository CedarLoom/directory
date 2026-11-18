const variablePart = /<<var;name="([^"]*)";original="((?:[^"]|"(?!;match="))*)";match="(?:[^"]|"(?!>>))*">>/g;

// The Creative Commons 4.0 templates give an empty original for parts their patterns require; a license file has its
// copyright notice on a line of its own.
function filled(name: string, original: string): string {
  if (/^(?:copyright|©|\(c\))/i.test(original)) return `${original}\n`;
  if (name === 'ccLicensed') return 'CC-licensed';
  if (/^section\dTitleHyphens$/.test(name)) return '–';
  return original;
}

/** The license text an SPDX template writes with its optional parts and the original of each variable part. */
export const templateLicenseText = (template: string) =>
  template
    .replace(/<<beginOptional>>|<<endOptional>>/g, '')
    .replace(variablePart, (_part, name: string, original: string) => filled(name, original));
