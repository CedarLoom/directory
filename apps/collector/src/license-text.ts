import templates from './license-templates.json' with { type: 'json' };

// SPDX license-list-data v3.29.0 standard templates of the class table's licenses, an identical one once.
const templateTexts: Readonly<Record<string, string>> = templates;

const copyrightNotice = /^(?:copyright ?(?:©|\(c\))|(?:copyright|©|\(c\)) ?(?:\d{4}|[[<{]))/i;
// A sentence break, but not after an initial such as the "A." of "A. Person".
const sentenceBreak = /(?<=\p{L}{2}|\d|\))[.!?;] +(?=\p{L})/u;

// Words and phrases of terms that a copyright line may add. A holder's name is not checked, as it may be spelled in any
// case or script; words that are common in names, such as "use", "no", "free" or "personal", are left out.
const addedTerm =
  /\b(?:only|(?:non-?|no-?)?commercial(?:ly)?|nc|proprietary|confidential\w*|evaluation|trial|expir\w*|internal(?:ly)?|prohibit\w*|restrict\w*|forbid\w*|permi\w*|licen[cs]\w*|not|must|shall|require\w*|requiring|except\w*|without|sell\w*|resell\w*|resale|redistribut\w*|military|purposes?|attribution|mandatory|revoc\w*|revok\w*|free for)\b/i;

// A part of a copyright line that is a notice: it opens with the copyright marks and holds no words of terms.
const isWholeNotice = (part: string) => copyrightNotice.test(part) && !addedTerm.test(part);

// SPDX matching guidelines B.10 and B.11: a line of copyright notices is ignored, but not one that adds other terms.
function isNotice(line: string): boolean {
  return line.split(sentenceBreak).every((part) => isWholeNotice(part) || /^all rights reserved\.?$/i.test(part));
}

// B.12: a title is ignored; a title line is short and holds only words of the license's id and name, or a version.
const titleWord = /[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*/gu;
const version = /^v?\d+(?:\.\d+)*$/;
const licenseWord = /^licen[cs]e$/;
const headingWords = ['the', 'version', 'v'];

const titleWords = (text: string) => normalize(text).match(titleWord) ?? [];
// B.7 and B.8: comment marks, rules and boxes around the text are ignored.
const commentMark = /^(?:#{1,6} |\/\/|\/\*|\*\/|\*(?= |$)) ?| ?(?:\*\/|(?<= |^)\*)$/g;
const rule = /^[-=*_#~]{3,}$/;
const optionalMark = /<<beginOptional>>|<<endOptional>>/g;
const leadingOptionalMarks = /^(?:<<(?:begin|end)Optional>> ?)*/;
const templateToken =
  /<<beginOptional>>|<<endOptional>>|<<var;name="[^"]*";original="((?:[^"]|"(?!;match="))*)";match="((?:[^"]|"(?!>>))*)">>/g;
const dashes = /[-\u2010-\u2015\u2212]+/g;
const quotes = /[‘’‚‛“”„‟`'"«»]+/g;
const cjk = /(?<=[\p{Script=Han}\u3000-\u303f\uff00-\uffef]) (?=[\p{Script=Han}\u3000-\u303f\uff00-\uffef])/gu;

function uncommented(raw: string, template: boolean): string {
  // Collapsed first, so that no pattern below meets a long run of whitespace.
  const line = raw.replace(/\s+/g, ' ').trim();
  const marks = template ? (leadingOptionalMarks.exec(line)?.[0] ?? '') : '';
  return marks + line.slice(marks.length).replace(commentMark, '').trim();
}

// A notice wrapped onto a second line: the two lines, read as one, must still be a notice without terms. A period that
// ends the first line, as in "Inc.", does not end the notice.
const continuesNotice = (notice: string, bare: string) =>
  notice !== '' && bare !== '' && isNotice(`${notice.replace(/\.$/, '')} ${bare}`);

// Each part of a template line between its own optional marks becomes optional, so that its optional parts stay balanced.
const optionalLine = (line: string) =>
  line.replace(/(?:(?!<<(?:begin|end)Optional>>).)+/g, (part) => `<<beginOptional>>${part}<<endOptional>>`);

function textLines(text: string, template: boolean): string[] {
  let notice = '';
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .map((raw) => {
      const line = uncommented(raw, template);
      // A template's variable part reads as a placeholder, as an unfilled notice has.
      const bare = template ? line.replace(optionalMark, '').replace(templateToken, '[X]') : line;
      const own = isNotice(bare);
      const continues = !own && continuesNotice(notice, bare);
      notice = own ? bare : '';
      if (!own && !continues && !rule.test(bare)) return line;
      if (!template) return '';
      // A text may set the line a notice wraps onto apart from it with a blank line, so a template keeps it as optional.
      return continues ? optionalLine(line) : (line.match(optionalMark) ?? []).join('');
    });
}

// B.4 to B.6 and B.14: whitespace, case, dashes, quotes, the copyright sign and http or https are equivalent.
function normalize(text: string): string {
  return text
    .replace(dashes, '-')
    .replace(quotes, '"')
    .replace(/https?:\/\//gi, 'http://')
    .replace(/©/g, '(c)')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\/(?=[>)"])/g, '')
    .replace(cjk, '')
    .trim();
}

const isPunctuation = (char: string | undefined) => char !== undefined && char !== ' ' && !/[\p{L}\p{N}]/u.test(char);

/** A normalized text, and the same text without the spaces next to punctuation, which copies of a license differ in. */
interface Compact {
  spaced: string;
  text: string;
  /** The index in `spaced` of each index in `text`, and of its end. */
  at: number[];
}

function compact(spaced: string): Compact {
  const at: number[] = [];
  let text = '';
  for (let index = 0; index < spaced.length; index += 1) {
    if (spaced[index] === ' ' && (isPunctuation(spaced[index - 1]) || isPunctuation(spaced[index + 1]))) continue;
    at.push(index);
    text += spaced[index];
  }
  at.push(spaced.length);
  return { spaced, text, at };
}

type Step =
  | { kind: 'text'; text: string }
  | { kind: 'var'; pattern: RegExp; maxLength: number; next: string[]; atEnd: boolean; beforeVar: boolean }
  | { kind: 'open'; close: number }
  | { kind: 'close' };

/** A template as steps, the text outside its optional parts, which a match holds, and the words its title may hold. */
interface Template {
  steps: Step[];
  required: string[];
  title: ReadonlySet<string>;
}

// A variable part longer than its pattern states, or than 1000 characters, is no license's: the longest is a notice.
function maxLength(pattern: string): number {
  const bound = /^\.\{\d*,(\d+)\}$/.exec(pattern)?.[1];
  return bound === undefined ? 1000 : Number(bound);
}

function variable(original: string, match: string): Step[] {
  const source = match.replace(quotes, '"').replace(dashes, '-');
  const step: Step = {
    kind: 'var',
    pattern: new RegExp(`^(?:${source})$`, 'i'),
    maxLength: maxLength(source),
    next: [],
    atEnd: false,
    beforeVar: false,
  };
  // A text's notice lines are dropped, so whatever stands where a template's notice does is a term the license lacks.
  return copyrightNotice.test(original.trim()) ? [] : [step];
}

function parse(template: string): Step[] {
  const source = textLines(template, true).join('\n');
  const steps: Step[] = [];
  const text = (part: string) => {
    const normalized = compact(normalize(part)).text;
    if (normalized !== '') steps.push({ kind: 'text', text: normalized });
  };
  let last = 0;
  for (const token of source.matchAll(templateToken)) {
    text(source.slice(last, token.index));
    last = token.index + token[0].length;
    if (token[0] === '<<beginOptional>>') steps.push({ kind: 'open', close: -1 });
    else if (token[0] === '<<endOptional>>') steps.push({ kind: 'close' });
    else steps.push(...variable(token[1] ?? '', token[2] ?? ''));
  }
  text(source.slice(last));
  return steps;
}

function linkOptionals(steps: Step[]): void {
  const open: number[] = [];
  for (const [index, step] of steps.entries()) {
    if (step.kind === 'open') open.push(index);
    else if (step.kind === 'close') {
      const start = open.pop();
      if (start === undefined) throw new Error('a license template closes an optional part it did not open');
      steps[start] = { kind: 'open', close: index };
    }
  }
  if (open.length > 0) throw new Error('a license template leaves an optional part open');
}

// What can follow a variable part: the texts that may start after it, the end, or another variable part.
function linkVariables(steps: Step[]): void {
  for (const [index, step] of steps.entries()) {
    if (step.kind !== 'var') continue;
    const next = new Set<string>();
    const seen = new Set<number>();
    const walk = (at: number): void => {
      if (seen.has(at)) return;
      seen.add(at);
      const following = steps[at];
      if (following === undefined) step.atEnd = true;
      else if (following.kind === 'text') next.add(following.text);
      else if (following.kind === 'var') step.beforeVar = true;
      else if (following.kind === 'close') walk(at + 1);
      else {
        walk(at + 1);
        walk(following.close + 1);
      }
    };
    walk(index + 1);
    step.next = [...next];
  }
}

// A template's optional opening part, which holds its title, with each variable part's original.
function opening(template: string): string {
  if (!template.startsWith('<<beginOptional>>')) return '';
  let depth = 0;
  for (const mark of template.matchAll(/<<(begin|end)Optional>>/g)) {
    depth += mark[1] === 'begin' ? 1 : -1;
    if (depth === 0) return template.slice(0, mark.index).replace(templateToken, (_token, original = '') => original);
  }
  throw new Error('a license template leaves an optional part open');
}

function compile(id: string, template: string): Template {
  const title = new Set([...headingWords, ...titleWords(id.replaceAll('-', ' ')), ...titleWords(opening(template))]);
  const steps = parse(template);
  linkOptionals(steps);
  linkVariables(steps);
  const required: string[] = [];
  let depth = 0;
  for (const step of steps) {
    if (step.kind === 'open') depth += 1;
    else if (step.kind === 'close') depth -= 1;
    else if (step.kind === 'text' && depth === 0) required.push(step.text);
  }
  return { steps, required, title };
}

const isTitleOf = ({ title }: Template, line: string) =>
  line.length <= 120 &&
  titleWords(line).every((word) => title.has(word) || licenseWord.test(word) || version.test(word));

// Where a word or a punctuation mark ends, from `from` to `limit`, for a variable part another one follows.
function boundaries(text: string, from: number, limit: number): number[] {
  const found = [from];
  for (let at = from + 1; at <= limit; at += 1) {
    if (at === text.length || text[at] === ' ' || isPunctuation(text[at - 1]) || isPunctuation(text[at]))
      found.push(at);
  }
  return found;
}

/** Where a variable part may end: where a text that can follow it starts, at the end, or between words. */
function variableEnds(step: Extract<Step, { kind: 'var' }>, text: string, from: number): number[] {
  const limit = Math.min(text.length, from + step.maxLength);
  const ends = new Set<number>(step.beforeVar ? boundaries(text, from, limit) : []);
  for (const next of step.next) {
    for (let at = text.indexOf(next, from); at !== -1 && at <= limit; at = text.indexOf(next, at + 1)) ends.add(at);
  }
  if (step.atEnd && text.length <= limit) ends.add(text.length);
  return [...ends].toSorted((a, b) => a - b);
}

// The work one template may take on one text; a text that needs more is not that license's.
const workLimit = 200_000;

class OverBudget extends Error {}

/** Whether the text is the template's: a search over (step, position), each state tried once. */
function matches({ steps, required }: Template, { spaced, text, at }: Compact): boolean {
  if (!required.every((part) => text.includes(part))) return false;
  const failed = new Set<number>();
  let work = 0;
  const skipSpace = (position: number) => (text[position] === ' ' ? position + 1 : position);
  const spend = (units: number) => {
    work += units;
    if (work > workLimit) throw new OverBudget();
  };
  const from = (index: number, position: number): boolean => {
    const step = steps[index];
    if (step === undefined) return position === text.length;
    const key = index * (text.length + 1) + position;
    if (failed.has(key)) return false;
    spend(1);
    const found = tryStep(step, index, position);
    if (!found) failed.add(key);
    return found;
  };
  const tryStep = (step: Step, index: number, position: number): boolean => {
    if (step.kind === 'text')
      return text.startsWith(step.text, position) && from(index + 1, skipSpace(position + step.text.length));
    if (step.kind === 'open') return from(index + 1, position) || from(step.close + 1, position);
    if (step.kind === 'close') return from(index + 1, position);
    return variableEnds(step, text, position).some((end) => {
      spend(1 + Math.ceil((end - position) / 100));
      const value = spaced.slice(at[position], at[end]).trim();
      return step.pattern.test(value) && from(index + 1, skipSpace(end));
    });
  };
  try {
    return from(0, 0);
  } catch (error) {
    if (error instanceof OverBudget) return false;
    throw error;
  }
}

let compiled: ReadonlyMap<string, Template> | undefined;

function compiledTemplates(): ReadonlyMap<string, Template> {
  compiled ??= new Map(Object.entries(templateTexts).map(([id, template]) => [id, compile(id, template)]));
  return compiled;
}

/** A text without its first lines, which a template's license must take as its title. */
interface Reading {
  titles: string[];
  text: Compact;
}

// A text may open with up to three title lines that the template words differently.
function readings(text: string): Reading[] {
  const lines = textLines(text, false);
  const found: Reading[] = [{ titles: [], text: compact(normalize(lines.join('\n'))) }];
  const titles: string[] = [];
  let skipped = 0;
  for (let title = 0; title < 3; title += 1) {
    while (lines[skipped] === '') skipped += 1;
    const line = lines[skipped];
    if (line === undefined || ![...compiledTemplates().values()].some((template) => isTitleOf(template, line))) break;
    titles.push(line);
    skipped += 1;
    found.push({ titles: [...titles], text: compact(normalize(lines.slice(skipped).join('\n'))) });
  }
  return found;
}

/**
 * The SPDX id of the license whose template the text matches, by the SPDX matching guidelines, without fuzzy scoring;
 * no text matches two of the templates.
 */
export function licenseTextId(text: string): string | undefined {
  const texts = readings(text);
  for (const [id, template] of compiledTemplates()) {
    if (
      texts.some(
        (reading) => reading.titles.every((line) => isTitleOf(template, line)) && matches(template, reading.text),
      )
    )
      return id;
  }
  return undefined;
}
