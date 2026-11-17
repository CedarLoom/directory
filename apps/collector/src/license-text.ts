import templates from './license-templates.json' with { type: 'json' };

// SPDX license-list-data v3.29.0 standard templates of the class table's licenses, an identical one once.
const templateTexts: Readonly<Record<string, string>> = templates;

const copyrightNotice = /^(?:copyright ?(?:©|\(c\))|(?:copyright|©|\(c\)) ?(?:\d{4}|[[<{]))/i;
// A sentence break, but not after an initial such as the "A." of "A. Person".
const sentenceBreak = /(?<=\p{L}{2}|\d|\))[.!?;] +(?=\p{L})/u;

// SPDX matching guidelines B.10 and B.11: a line of copyright notices is ignored, but not one that adds other terms.
function isNotice(line: string): boolean {
  return line
    .split(sentenceBreak)
    .every((part) => copyrightNotice.test(part) || /^all rights reserved\.?$/i.test(part));
}

// B.12: a title is ignored; a title line is short, names a license and is no sentence.
const isTitle = (line: string) =>
  line.length <= 120 && /\b(?:un)?licen[cs]e\b/i.test(line) && !sentenceBreak.test(line) && !/[.!?;:]$/.test(line);
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

function cleanLine(raw: string, template: boolean): string {
  // Collapsed first, so that no pattern below meets a long run of whitespace.
  const line = raw.replace(/\s+/g, ' ').trim();
  const marks = template ? (leadingOptionalMarks.exec(line)?.[0] ?? '') : '';
  const cleaned = marks + line.slice(marks.length).replace(commentMark, '').trim();
  const bare = template ? cleaned.replace(optionalMark, '') : cleaned;
  if (!rule.test(bare) && !isNotice(bare)) return cleaned;
  // A template keeps the optional marks of a dropped line, so that its optional parts stay balanced.
  return template ? (cleaned.match(optionalMark) ?? []).join('') : '';
}

function textLines(text: string, template: boolean): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .map((line) => cleanLine(line, template));
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

/** A template as steps, the text outside its optional parts, which a match holds, and the length of all its text. */
interface Template {
  steps: Step[];
  required: string[];
  weight: number;
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

function compile(template: string): Template {
  const steps = parse(template);
  linkOptionals(steps);
  linkVariables(steps);
  const required: string[] = [];
  let depth = 0;
  let weight = 0;
  for (const step of steps) {
    if (step.kind === 'open') depth += 1;
    else if (step.kind === 'close') depth -= 1;
    else if (step.kind === 'text') {
      weight += step.text.length;
      if (depth === 0) required.push(step.text);
    }
  }
  return { steps, required, weight };
}

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
  compiled ??= new Map(Object.entries(templateTexts).map(([id, template]) => [id, compile(template)]));
  return compiled;
}

// A text may open with up to three title lines that the template words differently.
function readings(text: string): Compact[] {
  const lines = textLines(text, false);
  const found = [compact(normalize(lines.join('\n')))];
  let skipped = 0;
  for (let title = 0; title < 3; title += 1) {
    while (lines[skipped] === '') skipped += 1;
    if (!isTitle(lines[skipped] ?? '')) break;
    skipped += 1;
    found.push(compact(normalize(lines.slice(skipped).join('\n'))));
  }
  return found;
}

/**
 * The SPDX id of the license whose template the text matches, by the SPDX matching guidelines, without fuzzy scoring;
 * of several, the one with the most template text, as a longer license can hold a shorter one.
 */
export function licenseTextId(text: string): string | undefined {
  const texts = readings(text);
  let best: { id: string; weight: number } | undefined;
  for (const [id, template] of compiledTemplates()) {
    if ((best === undefined || template.weight > best.weight) && texts.some((reading) => matches(template, reading)))
      best = { id, weight: template.weight };
  }
  return best?.id;
}
