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

it('reads a runner behind an option before its subcommand word, and as unpinned behind an unknown one', () => {
  const cases: [string, string[]][] = [
    ['npm', ['--yes', 'exec', 'evil-server']],
    ['pnpm', ['--silent', 'dlx', 'evil-server']],
    ['uv', ['--quiet', 'tool', 'run', 'evil-server']],
    ['pipx', ['--verbose', 'run', 'evil-server']],
    ['yarn', ['--cwd', 'x', 'dlx', 'evil-server']],
    ['npm', ['--frobnicate', 'exec', 'docs-mcp@1.2.3']],
    ['npm', ['--yes', 'exec', 'docs-mcp@1.2.3']],
    ['npm', ['--prefix', 'app', 'start']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
  ]);
});

it('reads -c as a flag of pnpm and as an option with a value of npx', () => {
  const cases: [string, string[]][] = [
    ['pnpm', ['dlx', '-c', 'evil-server', 'decoy@1.0.0']],
    ['npx', ['--package=docs-mcp@1.2.3', '-c', 'docs --stdio']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([true, false]);
});

it('reads the short, Windows and cmd spellings of a runner like the runner', () => {
  const cases: [string, string[]][] = [
    ['npm', ['x', 'evil-server']],
    ['bun', ['x', 'evil-server']],
    ['pnpx', ['evil-server']],
    ['npx.cmd', ['evil-server']],
    ['C:\\Program Files\\nodejs\\NPX.CMD', ['-y', 'evil-server']],
    ['cmd', ['/c', 'npx', '-y', 'evil-server']],
    ['cmd', ['/c', 'npx', '-y', 'docs-mcp@1.2.3']],
    ['cmd', ['/c', 'node', 'server.js']],
    ['bun', ['run', 'server.ts']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
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
