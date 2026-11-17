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

it('reads the runner a shell wrapper starts from plain words, and as unpinned when it cannot read them', () => {
  const cases: [string, string[]][] = [
    ['cmd', ['/c', 'npx -y evil-server']],
    ['cmd.exe', ['/d', '/s', '/c', 'npx -y docs-mcp@1.2.3']],
    ['cmd', ['/K', 'npx', '-y', 'evil-server']],
    ['cmd', ['/c', 'npx -y docs-mcp@1.2.3 & calc']],
    ['cmd', ['/c', 'node server.js']],
    ['sh', ['-c', 'npx -y evil-server']],
    ['/bin/sh', ['-c', 'npx -y docs-mcp@1.2.3']],
    ['bash', ['-lc', 'API_URL=https://x.test uvx evil-server']],
    ['bash', ['-c', 'cd app && node server.js']],
    ['bash', ['-o', 'pipefail', '-c', 'node server.js']],
    ['sh', ['-c', 'node server.js']],
    ['bash', ['server.sh']],
    ['env', ['TOKEN=x', 'npx', '-y', 'evil-server']],
    ['/usr/bin/env', ['-i', 'PATH=/usr/bin', 'npx', 'docs-mcp@1.2.3']],
    ['env', ['-S', 'npx docs-mcp@1.2.3']],
    ['env', ['node', 'server.js']],
    ['cmd', ['/c', 'env', 'X=1', 'npx', 'evil-server']],
    ['sh', ['-c', 'exec npx -y evil-server']],
    ['bash', ['-euo', 'pipefail', '-c', 'npx -y docs-mcp@1.2.3']],
    ['bash', ['--norc', 'server.sh', '-config', 'prod.json']],
    ['cmd', ['/c', 'npx -y docs-mcp@1.2.3 --glob *.md']],
    ['env', Array.from({ length: 10_000 }, () => 'env')],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    false,
    true,
    true,
    false,
    true,
    false,
    true,
    true,
    false,
    false,
    false,
    true,
    false,
    true,
    false,
    true,
    true,
    false,
    false,
    false,
    true,
  ]);
});

it('reads a package that uv run installs with --with as pinned only with an exact version', () => {
  const cases: [string, string[]][] = [
    ['uv', ['run', '--with', 'requests', 'server.py']],
    ['uv', ['run', '--with', 'requests==2.32.3', 'server.py']],
    ['uv', ['run', '--with=httpx', '--with', 'requests==2.32.3', 'server.py']],
    ['uv', ['--project', 'app', 'run', '--with', 'requests', 'server.py']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([true, false, true, true]);
});

it('reads no package behind an unknown option when the subcommand word of a runner does not follow', () => {
  const cases: [string, string[]][] = [
    ['bun', ['--hot', 'server.ts']],
    ['pnpm', ['--dir', 'app', 'start']],
    ['uv', ['--project', 'app', 'run', 'server.py']],
    ['pnpm', ['--dir', 'app', 'dlx', 'evil-server']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([false, false, false, true]);
});
