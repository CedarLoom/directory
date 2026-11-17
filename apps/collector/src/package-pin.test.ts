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

it('reads a package as unpinned behind an option the runner table does not know', () => {
  const cases: [string, string[]][] = [
    ['npx', ['--globalconfig', 'decoy@1.0.0', 'evil-server']],
    ['uvx', ['--cache-dir', 'decoy==1.0', 'evil-server']],
    ['docker', ['run', '--cidfile', '/tmp/x:1', 'acme/evil']],
    ['docker', ['run', '-it', '--rm', 'ghcr.io/acme/docs:1.2.3']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([true, true, true, false]);
});

it('reads the npx, uvx and docker runners under their other names', () => {
  const cases: [string, string[]][] = [
    ['bunx', ['evil-server']],
    ['npm', ['exec', 'evil-server']],
    ['pnpm', ['dlx', 'evil-server']],
    ['yarn', ['dlx', 'evil-server']],
    ['uv', ['tool', 'run', 'evil-server']],
    ['pipx', ['run', 'evil-server']],
    ['podman', ['run', 'acme/evil']],
    ['npm', ['exec', '--', 'docs-mcp@1.2.3']],
    ['pipx', ['run', '--spec', 'docs-mcp==1.2.3', 'docs']],
    ['npm', ['start']],
    ['uv', ['run', 'server.py']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
  ]);
});

it('reads a uv package named by a URL as unpinned', () => {
  const cases: [string, string[]][] = [
    ['uvx', ['--from', 'tool@git+https://github.com/acme/tool', 'tool']],
    ['uvx', ['tool@https://acme.test/tool.whl']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([true, true]);
});
