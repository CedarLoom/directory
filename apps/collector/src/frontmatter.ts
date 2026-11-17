/** A Markdown file split into its YAML frontmatter fields and its body. */
export interface Frontmatter {
  /** Top-level keys in file order: a string, or a list for a flow or block list; a block scalar reads as ''. */
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

function inlineValue(raw: string): string | string[] {
  // A ` #` starts a comment unless the value is quoted; one scan for it, as `/\s+#.*$/` is quadratic on a run of blanks.
  const comment = raw.search(/\s#/);
  const value = /^["']/.test(raw) || comment === -1 ? raw : raw.slice(0, comment).trimEnd();
  if (/^\[.*\]$/.test(value))
    return value
      .slice(1, -1)
      .split(',')
      .map(unquote)
      .filter((item) => item !== '');
  // A block scalar's text follows on indented lines, which no field read here needs.
  return /^[|>][+-]?$/.test(value) ? '' : unquote(value);
}

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
 * value that continues on indented lines reads as its lines joined by spaces, which keeps its length.
 */
function readFields(block: string): Map<string, string | string[]> {
  const fields = new Map<string, string | string[]>();
  let current: string | undefined;
  let text = false;
  for (const line of block.split(/\r?\n/)) {
    const [, key, value] = keyLine.exec(line) ?? [];
    if (key !== undefined) {
      const raw = value?.trim() ?? '';
      const parsed = inlineValue(raw);
      [current, text] = [key, raw !== '' && typeof parsed === 'string'];
      fields.set(key, parsed);
    } else if (current !== undefined && text) addTextLine(fields, current, line);
    else if (current !== undefined) addListItem(fields, current, line);
  }
  return fields;
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
