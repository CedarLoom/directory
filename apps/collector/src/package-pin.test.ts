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

it('reads the runner a shell wrapper starts from plain words', () => {
  const cases: [string, string[]][] = [
    ['cmd', ['/c', 'npx -y evil-server']],
    ['cmd.exe', ['/d', '/s', '/c', 'npx -y docs-mcp@1.2.3']],
    ['cmd', ['/K', 'npx', '-y', 'evil-server']],
    ['cmd', ['/c', 'node server.js']],
    ['sh', ['-c', 'npx -y evil-server']],
    ['/bin/sh', ['-c', 'npx -y docs-mcp@1.2.3']],
    ['bash', ['-lc', 'API_URL=https://x.test uvx evil-server']],
    ['bash', ['-o', 'pipefail', '-c', 'node server.js']],
    ['sh', ['-c', 'node server.js']],
    ['bash', ['server.sh']],
    ['env', ['TOKEN=x', 'npx', '-y', 'evil-server']],
    ['/usr/bin/env', ['-i', 'PATH=/usr/bin', 'npx', 'docs-mcp@1.2.3']],
    ['env', ['node', 'server.js']],
    ['cmd', ['/c', 'env', 'X=1', 'npx', 'evil-server']],
    ['sh', ['-c', 'exec npx -y evil-server']],
    ['bash', ['-euo', 'pipefail', '-c', 'npx -y docs-mcp@1.2.3']],
    ['bash', ['--norc', 'server.sh', '-config', 'prod.json']],
    ['cmd', ['/c', 'npx -y docs-mcp@1.2.3 --glob *.md']],
    ['env', ['A.B=1', 'npx', '-y', 'evil-server']],
    ['bash', ['-oc', 'pipefail', 'npx -y evil-server']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    false,
    false,
    false,
    true,
    true,
  ]);
});

it('reads a wrapped line it cannot read as unpinned only when it names a runner', () => {
  const cases: [string, string[]][] = [
    ['sh', ['-c', 'npx -y docs-mcp@1.2.3 $(cat args)']],
    ['bash', ['-c', '(cd app && node server.js)']],
    ['sh', ['-c', 'cd app && uv run --with "mcp>=1.0" server.py']],
    ['sh', ['-c', 'cd app && uv run --no-project server.py']],
    ['env', ['-S', 'npx docs-mcp@1.2.3']],
    ['env', [...Array.from({ length: 10_000 }, () => 'env'), 'npx', 'docs-mcp@1.2.3']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    false,
    true,
    false,
    true,
    true,
  ]);
});

it('reads each command of a compound line, with the plugin paths of Claude Code as local paths', () => {
  const cases: [string, string[]][] = [
    ['sh', ['-c', 'cd ${CLAUDE_PLUGIN_ROOT}/docker && ./start.sh']],
    ['bash', ['-c', 'echo "install via npx" >&2; exec node s.js']],
    ['sh', ['-c', 'cd app && uv run server.py | grep -w ERROR']],
    ['sh', ['-c', 'cd app && npx -y docs-mcp@1.2.3']],
    ['sh', ['-c', 'cd $HOME && npx -y docs-mcp@1.2.3']],
    ['cmd', ['/c', 'npx -y docs-mcp@1.2.3 & calc']],
    ['sh', ['-c', 'node s.js 2>/dev/null || npx -y evil-server']],
    ['bash', ['-c', `cd "\${CLAUDE_PLUGIN_DATA}" && npx -y 'evil-server'`]],
    ['sh', ['-c', 'npx -y docs-mcp@$VERSION']],
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
  ]);
});

it('reads the command that other shells and command prefixes start', () => {
  const cases: [string, string[]][] = [
    ['zsh', ['-c', 'npx -y evil-server']],
    ['dash', ['-c', 'npx -y evil-server']],
    ['/bin/ksh', ['-c', 'npx -y evil-server']],
    ['pwsh', ['-NoProfile', '-Command', 'npx', '-y', 'evil-server']],
    ['powershell.exe', ['-c', String.raw`& 'C:\Program Files\nodejs\npx.cmd' -y evil-server`]],
    ['cmd', ['/c', '@npx -y evil-server']],
    ['cmd', ['/c', 'call npx -y evil-server']],
    ['nohup', ['npx', '-y', 'evil-server']],
    ['sh', ['-c', 'command npx -y evil-server']],
    ['sh', ['-c', 'exec -a docs npx -y evil-server']],
    ['sh', ['-c', 'command -v npx && node server.js']],
    ['pwsh', ['-File', 'server.ps1']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    true,
    true,
    true,
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

it('reads uv run as local code unless it installs a package without an exact version or runs a script from a URL', () => {
  const cases: [string, string[]][] = [
    ['uv', ['run', '--with', 'requests', 'server.py']],
    ['uv', ['run', '--with', 'requests==2.32.3', 'server.py']],
    ['uv', ['run', '--with=httpx', '--with', 'requests==2.32.3', 'server.py']],
    ['uv', ['--project', 'app', 'run', '--with', 'requests', 'server.py']],
    ['uv', ['run', '-w', 'requests', 'server.py']],
    ['uv', ['run', '--no-dev', '--extra', 'cli', '--group', 'mcp', '--package', 'app', 'server.py']],
    ['uv', ['run', '--all-extras', '--exact', '--no-env-file', '-s', 'server.py']],
    ['uv', ['run', '--frobnicate', 'server.py']],
    ['uv', ['run', 'https://x.test/evil.py']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    true,
  ]);
});

it('reads --with behind the hidden value options of uv run and in single-letter options given together', () => {
  const cases: [string, string[]][] = [
    ['uv', ['run', '--trusted-host', 'pypi.test', '--with', 'requests', 'server.py']],
    ['uv', ['run', '--config-settings', 'key=value', '--with', 'requests', 'server.py']],
    ['uv', ['run', '--python-preference', 'managed', '--with', 'requests', 'server.py']],
    ['uv', ['run', '--preview-features', 'pylock', '--with', 'requests', 'server.py']],
    ['uv', ['run', '-wrequests', 'server.py']],
    ['uv', ['run', '-qw', 'requests', 'server.py']],
    ['npx', ['-yp', 'docs-mcp@1.2.3', 'docs']],
    ['npx', ['-pdocs-mcp@1.2.3', 'docs']],
  ];
  expect(cases.map(([command, args]) => unpinnedPackage(command, args))).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    true,
  ]);
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
