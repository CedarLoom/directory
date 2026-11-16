import { z } from 'zod';
import { gitSha } from './fields.ts';

/** The source kinds of a marketplace entry; `path` is a relative path, `other` any kind outside the official list. */
const sourceKinds = ['path', 'github', 'url', 'git-subdir', 'npm', 'archive', 'command', 'other'] as const;
export const sourceKind = z.enum(sourceKinds);
type SourceKind = z.infer<typeof sourceKind>;

export const pin = z.enum(['sha', 'ref', 'version', 'marketplace-commit', 'none']);
type Pin = z.infer<typeof pin>;

// Upstream entries carry more keys than these; only the keys that decide the pin are read.
const gitSource = z.looseObject({ sha: gitSha.optional(), ref: z.string().min(1).optional() });
const npmSource = z.looseObject({ version: z.string().min(1).optional() });
const entrySource = z.union([z.string().min(1), z.looseObject({ source: z.string() })]);

// A range, a tag or a prefixed version such as `^1.2.3` or `latest` resolves to different releases over time.
const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function gitPin(source: unknown): Pin {
  const { sha, ref } = gitSource.parse(source);
  if (sha !== undefined) return 'sha';
  return ref === undefined ? 'none' : 'ref';
}

function npmPin(source: unknown): Pin {
  const { version } = npmSource.parse(source);
  return version !== undefined && exactVersion.test(version) ? 'version' : 'none';
}

/** Reads the `source` value of a marketplace entry; a known kind with malformed pin keys is refused. */
export function classifySource(source: unknown): { kind: SourceKind; pin: Pin } {
  const parsed = entrySource.parse(source);
  if (typeof parsed === 'string') return { kind: 'path', pin: 'marketplace-commit' };
  switch (parsed.source) {
    case 'github':
    case 'url':
    case 'git-subdir':
      return { kind: parsed.source, pin: gitPin(parsed) };
    case 'npm':
      return { kind: 'npm', pin: npmPin(parsed) };
    case 'archive':
    case 'command':
      return { kind: parsed.source, pin: 'none' };
    default:
      return { kind: 'other', pin: 'none' };
  }
}
