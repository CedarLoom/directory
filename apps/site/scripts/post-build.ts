import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// An inline script has no src attribute; a script's text cannot contain `</script>`, so the lazy match ends at its own tag.
const inlineScript = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

function sha256(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** The page with its Content-Security-Policy as the first element of `<head>`, so it applies to everything after it. */
export function withPolicy(html: string): string {
  if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error('The page already has a policy');
  if (/<[^>]+\son[a-z]+=/i.test(html)) throw new Error('An inline event handler would need unsafe-hashes');
  const hashes = [...new Set([...html.matchAll(inlineScript)].map(([, text = '']) => sha256(text)))];
  const policy = [
    "default-src 'self'",
    ['script-src', "'self'", ...hashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
  ].join('; ');
  const head = html.indexOf('<head>');
  if (head < 0) throw new Error('The page has no <head>');
  const at = head + '<head>'.length;
  return `${html.slice(0, at)}<meta http-equiv="Content-Security-Policy" content="${policy}"/>${html.slice(at)}`;
}

if (import.meta.main) {
  const client = new URL('../dist/client/', import.meta.url).pathname;
  const pages = readdirSync(client, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.html'));
  if (pages.length === 0) throw new Error(`No pages in ${client}`);
  for (const page of pages) {
    const file = join(client, page);
    writeFileSync(file, withPolicy(readFileSync(file, 'utf8')));
  }
  console.log(`Content-Security-Policy written into ${pages.length} pages`);
}
