import deprecatedSpdxIds from 'spdx-license-ids/deprecated.json' with { type: 'json' };
import spdxIds from 'spdx-license-ids/index.json' with { type: 'json' };
import { z } from 'zod';

// Records hold no third-party prose: every string is an id, a name, a URL, a date or a value of an own vocabulary.

const kinds = ['marketplace', 'plugin', 'skill', 'agent', 'hook', 'mcp-server', 'output-style'] as const;
export const kind = z.enum(kinds);

export const itemId = z
  .string()
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

/** The item's own identifier; 64 characters as the Agent Skills spec limits `name`. */
export const itemName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/);

/** An MCP server's `<namespace>/<name>` as the MCP Registry allows it. */
export const registryName = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);

/** A field, event or signal name of an upstream format or a rubric. */
export const keyword = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);

export const tag = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);

const linkHosts = [
  'github.com',
  'registry.modelcontextprotocol.io',
  'www.npmjs.com',
  'pypi.org',
  'skills.sh',
  'claude.com',
];

/** https on an allow-listed host, no user info, port, query or fragment. */
export const httpsUrl = z
  .string()
  .max(512)
  .regex(
    new RegExp(
      `^https://(?:${linkHosts.map((host) => host.replaceAll('.', '\\.')).join('|')})(?:/[A-Za-z0-9._~%!$&'()*+,;=:@/-]*)?$`,
    ),
  );

export const date = z.iso.date();
export const dateTime = z.iso.datetime();
export const count = z.int().nonnegative();
export const share = z.number().min(0).max(1);
export const gitSha = z.string().regex(/^[0-9a-f]{40}$/);
export const semver = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);

/** A version, tag or ref as an upstream sets it. */
export const versionLabel = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z._+/-]{0,63}$/);

// GitHub's license detection returns deprecated ids such as GPL-3.0; its NOASSERTION is stored as no `spdx` with class `none`.
export const spdxId = z.enum([...spdxIds, ...deprecatedSpdxIds]);

const sourceIds = [
  'official-marketplace',
  'community-marketplace',
  'anthropic-marketplaces',
  'github',
  'mcp-registry',
  'seeds',
] as const;
export const sourceId = z.enum(sourceIds);
export type SourceId = z.infer<typeof sourceId>;

const flags = [
  'hook-shell-command',
  'hook-session-start',
  'hook-match-all',
  'hook-http',
  'monitor-background-command',
  'bin-executables',
  'scripts-present',
  'network-indicator',
  'mcp-stdio-unpinned-package',
  'mcp-remote',
  'mcp-secrets-required',
  'allowed-tools-unrestricted-bash',
  'agent-inherits-all-tools',
  'install-command-source',
  'unpinned-source',
  'listed-official-marketplace',
] as const;
export const flag = z.enum(flags);

export const licenseClass = z.enum(['permissive', 'copyleft', 'source-available', 'none']);
export const fitLabel = z.enum(['complements', 'overlaps', 'may-conflict', 'not-assessed']);
