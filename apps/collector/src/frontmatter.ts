import { authorKeys, keyword } from '@directory/contracts';
import { z } from 'zod';

/** A Markdown file split into its YAML frontmatter fields and its body. */
export interface Frontmatter {
  /** Top-level keys in file order: a string, or a list for a flow or block list. */
  fields: Map<string, string | string[]>;
  /** Characters between the `---` lines. */
  metadataLength: number;
  body: string;
}

const opening = /^\uFEFF?---\r?\n/;
const closing = /^---[ \t]*$/m;
// With `s`, `.` also takes a lone `\r`, so a line holding one matches without backtracking over the run of blanks.
const keyLine = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/s;
const listItem = /^[ \t]*-[ \t]+(.*)$/s;

function unquote(value: string): string {
  const trimmed = value.trim();
  return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/** The value without its comment: a `#` at its start or after a blank starts one, unless the value is quoted. */
function uncommented(raw: string): string {
  if (raw.startsWith('#')) return '';
  // One scan for ` #`, as `/\s+#.*$/` is quadratic on a run of blanks.
  const comment = raw.search(/\s#/);
  return /^["']/.test(raw) || comment === -1 ? raw : raw.slice(0, comment).trimEnd();
}

function inlineValue(value: string): string | string[] {
  if (/^\[.*\]$/.test(value))
    return value
      .slice(1, -1)
      .split(',')
      .map(unquote)
      .filter((item) => item !== '');
  return unquote(value);
}

// A block scalar header, with its optional chomping and indentation indicators; its text follows on indented lines.
const blockScalar = /^[|>][1-9+-]{0,2}$/;
const commentLine = /^\s*#/;

/** Adds a block list item to the key above it when that key opened a list. */
function addListItem(fields: Map<string, string | string[]>, key: string, line: string): void {
  const [, item] = listItem.exec(line) ?? [];
  if (item === undefined) return;
  const list = fields.get(key);
  // Appended in place: a copy per item is quadratic on a long list.
  if (Array.isArray(list)) list.push(unquote(item));
  else if (list === '') fields.set(key, [unquote(item)]);
}

const continuation = /^[ \t]+(\S.*)$/s;

/** Adds an indented line to the text of the key above it, joined by a space. */
function addTextLine(fields: Map<string, string | string[]>, key: string, line: string): void {
  const [, more] = continuation.exec(line) ?? [];
  const text = fields.get(key);
  if (more !== undefined && typeof text === 'string') fields.set(key, text === '' ? more : `${text} ${more}`);
}

/**
 * Reads the top-level keys only; nested maps are not parsed, as no stored fact needs them. A block scalar or a plain
 * value on indented lines reads as its lines joined by spaces, which keeps its length; under a key without a value,
 * `- ` lines form a block list. A comment line is skipped outside a block scalar, whose text it is part of.
 */
function readFields(block: string): Map<string, string | string[]> {
  const fields = new Map<string, string | string[]>();
  let current: OpenKey | undefined;
  for (const line of block.split(/\r?\n/)) {
    const [, key, value] = keyLine.exec(line) ?? [];
    if (key !== undefined) current = readKey(fields, key, value);
    else if (current !== undefined) addLine(fields, current, line);
  }
  return fields;
}

/** The key the next indented lines belong to: a key without a value may open a block list. */
interface OpenKey {
  key: string;
  empty: boolean;
  scalar: boolean;
}

function readKey(fields: Map<string, string | string[]>, key: string, value: string | undefined): OpenKey {
  const raw = uncommented(value?.trim() ?? '');
  const scalar = blockScalar.test(raw);
  fields.set(key, scalar ? '' : inlineValue(raw));
  return { key, empty: raw === '', scalar };
}

function addLine(fields: Map<string, string | string[]>, { key, empty, scalar }: OpenKey, line: string): void {
  if (!scalar && commentLine.test(line)) return;
  if (empty && listItem.test(line)) addListItem(fields, key, line);
  else addTextLine(fields, key, line);
}

export function readFrontmatter(text: string): Frontmatter {
  const open = opening.exec(text);
  const rest = open === null ? '' : text.slice(open[0].length);
  const close = closing.exec(rest);
  if (open === null || close === null) return { fields: new Map(), metadataLength: 0, body: text };
  const block = rest.slice(0, close.index);
  return {
    fields: readFields(block),
    metadataLength: block.length,
    body: rest.slice(close.index + close[0].length).replace(/^\r?\n/, ''),
  };
}

// Token figures are estimates: characters divided by 4.
export function tokenEstimate({ metadataLength, body }: Frontmatter): { metadata: number; body: number } {
  return { metadata: Math.ceil(metadataLength / 4), body: Math.ceil(body.length / 4) };
}

/** Lines of the body without trailing blank lines. */
export function bodyLines({ body }: Frontmatter): number {
  const trimmed = body.trimEnd();
  return trimmed === '' ? 0 : trimmed.split(/\r?\n/).length;
}

/** The field as one string; a list or a missing field gives undefined. */
export function textField(frontmatter: Frontmatter, key: string): string | undefined {
  const value = frontmatter.fields.get(key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

const fieldsInRecord = z.object({ frontmatterFields: authorKeys });

/** The keys that are keywords, in file order; more than a record holds throw a ZodError. */
export function frontmatterFields({ fields }: Frontmatter): string[] {
  const keys = [...fields.keys()].filter((key) => keyword.safeParse(key).success);
  return fieldsInRecord.parse({ frontmatterFields: keys }).frontmatterFields;
}
