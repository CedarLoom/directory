// Dependency review's license check for where it cannot run (a private repository on GitHub Free), same config file.
import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { z } from 'zod';

const report = z.record(z.string(), z.array(z.object({ name: z.string(), versions: z.array(z.string()) })));
// With --json, pnpm writes a failure to stdout in this shape instead of a report.
const failure = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const config = z.object({
  'allow-licenses': z.array(z.string()),
  'allow-dependencies-licenses': z.array(z.string()).default([]),
});

/** An SPDX expression is allowed when one OR branch has only allowed licenses. */
export function isAllowed(expression: string, allowed: ReadonlySet<string>): boolean {
  // A nested expression such as "A AND (B OR C)" fails closed: a person decides and exempts the package in the config.
  const flat = expression.replace(/^\((.*)\)$/, '$1');
  if (/[()]/.test(flat)) return false;
  return flat.split(' OR ').some((branch) => branch.split(' AND ').every((id) => allowed.has(id.trim())));
}

/** Lists `name@version: license` for every package whose license is not allowed and that is not exempt. */
export function disallowed(reportJson: unknown, configJson: unknown): string[] {
  const failed = failure.safeParse(reportJson);
  if (failed.success)
    throw new Error(`pnpm licenses list failed: ${failed.data.error.code}: ${failed.data.error.message}`);
  const packages = report.parse(reportJson);
  const rules = config.parse(configJson);
  const allowed = new Set(rules['allow-licenses']);
  const exempt = new Set(
    rules['allow-dependencies-licenses'].map((purl) => decodeURIComponent(purl.replace(/^pkg:npm\//, ''))),
  );
  return Object.entries(packages).flatMap(([license, entries]) =>
    isAllowed(license, allowed)
      ? []
      : entries
          .filter(({ name }) => !exempt.has(name))
          .map(({ name, versions }) => `${name}@${versions.join(',')}: ${license}`),
  );
}

if (import.meta.main) {
  const configJson: unknown = JSON.parse(await readFile('.github/dependency-review-config.json', 'utf8'));
  const found = disallowed(JSON.parse(await text(process.stdin)), configJson);
  if (found.length > 0) {
    console.error(`Packages under a license outside the allow-list:\n${found.join('\n')}`);
    process.exit(1);
  }
  console.log('All package licenses are on the allow-list.');
}
