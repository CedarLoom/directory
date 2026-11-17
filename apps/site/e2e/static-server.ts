import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

// Serves the built site the way a static host does: a folder answers with its index.html, a missing path with 404.html.
const root = new URL('../dist/client/', import.meta.url).pathname;
const types: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

async function fileAt(path: string): Promise<string | undefined> {
  const found = await stat(path).catch(() => undefined);
  if (found === undefined) return undefined;
  return found.isDirectory() ? fileAt(join(path, 'index.html')) : path;
}

createServer(async (request, response) => {
  const path = normalize(join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)));
  const file = path.startsWith(root) ? await fileAt(path) : undefined;
  if (file === undefined) {
    response.writeHead(404, { 'content-type': types['.html'] }).end(await readFile(join(root, '404.html')));
    return;
  }
  response
    .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    .end(await readFile(file));
}).listen(Number(process.env['PORT'] ?? 4173), '127.0.0.1');
