import { expect, it } from 'vitest';
import { unpinnedPackage } from './package-pin.ts';

it('reads a package run by npx, uvx or docker as pinned only with an exact version', () => {
  const cases: [string, string[]][] = [
    ['npx', ['-y', '@acme/docs-mcp@1.2.3']],
    ['npx', ['--package=docs-mcp@1.2.3', 'docs']],
    ['uvx', ['--from', 'docs-mcp==1.2.3', 'docs']],
    ['/usr/local/bin/uvx', ['docs-mcp@1.2.3']],
    ['docker', ['run', '-i', '--rm', '-e', 'TOKEN', 'ghcr.io/acme/docs:1.2.3']],
    ['node', ['server.js']],
    ['npx', ['-y', '@acme/docs-mcp']],
    ['npx', ['docs-mcp@^1.2.0']],
    ['npx', ['docs-mcp@latest']],
    ['npx', []],
    ['uvx', ['docs-mcp@latest']],
    ['uvx', ['--with', 'requests', 'docs-mcp==1.2.3']],
    ['docker', ['run', '-p', '8080:80', 'acme/docs']],
    ['docker', ['run', 'acme/docs:latest']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
});
