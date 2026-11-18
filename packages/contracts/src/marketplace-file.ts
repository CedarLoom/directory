import { z } from 'zod';
import { gitSha, itemName, versionLabel } from './fields.ts';

// Upstream marketplace files hold third-party text: these schemas keep only the keys the Directory reads and strip the rest.

const segment = String.raw`(?!\.\.?(?:/|$))[A-Za-z0-9._-]+`;

/** A path inside a repository as a marketplace entry writes it, such as `./plugins/lint`; no `.` or `..` segment. */
export const relativePath = z
  .string()
  .max(256)
  .regex(new RegExp(`^(?:\\./)?(?:${segment}(?:/${segment})*/?)?$`));

/** `.claude-plugin/marketplace.json`; each entry is parsed on its own, so one malformed entry does not refuse the file. */
export const marketplaceFile = z.object({ name: itemName, plugins: z.array(z.unknown()) });

/** An entry of `plugins`; `source` is read by `classifySource` and `gitSourceLocation`. */
export const marketplaceEntry = z.object({
  name: itemName,
  source: z.unknown(),
  homepage: z.string().optional(),
  // Read like a plugin manifest's license field, so a value of another type refuses nothing.
  license: z.unknown().optional(),
  skills: z.array(relativePath).optional(),
});

/** Where a `github`, `url` or `git-subdir` source points: `repo` or `url` (a git URL or `owner/repo`), a path and a pin. */
export const gitSourceLocation = z.object({
  repo: z.string().optional(),
  url: z.string().optional(),
  path: relativePath.optional(),
  // A `.` or `..` segment would move a link built from the ref to another repository.
  ref: versionLabel.refine((ref) => !ref.split('/').some((part) => part === '.' || part === '..')).optional(),
  sha: gitSha.optional(),
});
