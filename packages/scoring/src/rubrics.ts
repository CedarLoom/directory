import { contentHash, type Rubric, rubricFile } from '@directory/contracts';
import { z } from 'zod';
import agent from '../../../rubrics/agent/1.0.0.json' with { type: 'json' };
import agent110 from '../../../rubrics/agent/1.1.0.json' with { type: 'json' };
import hook from '../../../rubrics/hook/1.0.0.json' with { type: 'json' };
import lockFile from '../../../rubrics/lock.json' with { type: 'json' };
import marketplace from '../../../rubrics/marketplace/1.0.0.json' with { type: 'json' };
import mcpServer from '../../../rubrics/mcp-server/1.0.0.json' with { type: 'json' };
import outputStyle from '../../../rubrics/output-style/1.0.0.json' with { type: 'json' };
import outputStyle110 from '../../../rubrics/output-style/1.1.0.json' with { type: 'json' };
import plugin from '../../../rubrics/plugin/1.0.0.json' with { type: 'json' };
import plugin110 from '../../../rubrics/plugin/1.1.0.json' with { type: 'json' };
import skill from '../../../rubrics/skill/1.0.0.json' with { type: 'json' };
import skill110 from '../../../rubrics/skill/1.1.0.json' with { type: 'json' };

/** `rubrics/lock.json`: the content hash of each released rubric file by its path under `rubrics/`. */
const lock = z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/));

/** Parses released rubric files by path and refuses one that is missing from the lock or differs from its hash. */
export function lockedRubrics(files: Readonly<Record<string, unknown>>, lockValue: unknown): Rubric[] {
  const hashes = lock.parse(lockValue);
  for (const path of Object.keys(hashes))
    if (!Object.hasOwn(files, path)) throw new Error(`rubrics/${path} is in the lock but not released`);
  return Object.entries(files).map(([path, value]) => {
    const rubric = rubricFile.parse(value);
    if (path !== `${rubric.kind}/${rubric.version}.json`)
      throw new Error(`rubrics/${path} holds another kind or version`);
    const expected = hashes[path];
    if (expected === undefined) throw new Error(`rubrics/${path} is not in the lock`);
    // A released rubric never changes: a changed weight, threshold or measurement is a new version.
    if (contentHash(rubric) !== expected) throw new Error(`rubrics/${path} differs from its released version`);
    return rubric;
  });
}

const released = lockedRubrics(
  {
    'agent/1.0.0.json': agent,
    'agent/1.1.0.json': agent110,
    'hook/1.0.0.json': hook,
    'marketplace/1.0.0.json': marketplace,
    'mcp-server/1.0.0.json': mcpServer,
    'output-style/1.0.0.json': outputStyle,
    'output-style/1.1.0.json': outputStyle110,
    'plugin/1.0.0.json': plugin,
    'plugin/1.1.0.json': plugin110,
    'skill/1.0.0.json': skill,
    'skill/1.1.0.json': skill110,
  },
  lockFile,
);

function versionParts(version: string): number[] {
  return version.split('.').map(Number);
}

function byVersion(first: Rubric, second: Rubric): number {
  const [a, b] = [versionParts(first.version), versionParts(second.version)];
  return a.map((part, index) => part - (b[index] ?? 0)).find((difference) => difference !== 0) ?? 0;
}

/** The highest released rubric version of a kind, which scores every item of that kind in a run. */
export function currentRubric(kind: Rubric['kind']): Rubric {
  const latest = released
    .filter((rubric) => rubric.kind === kind)
    .toSorted(byVersion)
    .at(-1);
  if (latest === undefined) throw new Error(`No released rubric for ${kind}`);
  return latest;
}
