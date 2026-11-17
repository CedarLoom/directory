# AGENTS.md

## Commands

Node.js 26, pnpm 12 and uv. Install with `pnpm install --frozen-lockfile --ignore-scripts`.

- `pnpm run check`: every gate ([scripts/check.sh](scripts/check.sh)), the one to run before a push.
- Single gates, each as `pnpm run <name>`: `typecheck`, `lint`, `format:check` (`format` writes), `test`, `knip`, `jscpd`, `licenses`. Keep `run`: `pnpm licenses` alone is pnpm's built-in command.
- `pnpm --filter @directory/collector collect --dry-run` reads the sources, the MCP Registry and GitHub and prints the run report as JSON, the summary on stderr; `--out <folder>` instead writes every record, score history, popularity file and `index.json` of the run into a folder, and `--previous <folder>` reads the published data folder for its checkpoints and unchanged bytes. `GITHUB_TOKEN` is required, as the GitHub GraphQL API refuses anonymous requests; behind a proxy, set `NODE_USE_ENV_PROXY=1`.
- The refresh runs three steps from the repository root, with `node` rather than `pnpm`, whose script banner would land in the report: `node apps/collector/src/index.ts collect --out <candidate> --previous <published> > report.json`; then `validate --candidate <candidate> --report report.json --published <published>`, which exits 65 on a refusal (a file over its size cap or against its contract, a rubric that differs from its lock, more than 20 percent of the published items gone); then `publish --candidate <candidate> --report report.json --data <published>`, which writes the changed files and `meta.json` and commits them in the git work tree of `<published>` without pushing.
- The site builds from `apps/site/data/v1`, which git ignores: copy `apps/site/fixtures/data` there (`cp -R apps/site/fixtures/data apps/site/data`) before `pnpm run check`, as knip loads the Vite config, which reads it. `pnpm --filter @directory/site run build` writes the static site to `apps/site/dist/client`; `run e2e`, `run visual` and `run test-storybook` need the Playwright browsers.
- A released rubric in `rubrics/<kind>/<version>.json` never changes: a new weight, threshold or measurement is a new version file with its content hash added to `rubrics/lock.json`. The scoring tests fail on a released file that differs from its hash.
- `pnpm run test -u` rewrites the generated JSON Schemas in `packages/contracts/schemas/v1` after a schema change; commit them with it. The golden test fails on any difference.
- The Python-packaged gate tools (typos, reuse, actionlint, zizmor) run through `uvx` with the versions of [tools/requirements.txt](tools/requirements.txt). In CI, `pnpm run check` runs reuse only; the reusable gates workflow runs typos, actionlint and zizmor.

## Before you push

- Run `pnpm run check` after your last edit, right before every push. Never use `--no-verify`.
- Don't poll CI: wait with `gh run watch <run-id> --interval 30 --compact --exit-status` or `gh pr checks --watch --interval 30`.
- main stays releasable. A red main is fixed before anything else merges.

## Code

- Make the smallest change that does the whole task, including the callers, tests, fixtures, configuration and docs it breaks or changes. Add nothing speculative: no option, flag, layer, shim or "for later" code; name what you left out in one line of the report.
- Reuse in this order: code the repository has (extend it, never a parallel version; abstract at the second caller, not the first), the standard library or platform, an installed dependency, a maintained package (recent releases, a license the project allows, a size that fits; name it and why in the pull request), own code. A few own lines beat a new dependency.
- Validate where data enters (user input, files, the network, another process) and where a wrong value loses data or breaks security. Inside, trust the types, the framework and your own code: no guard or fallback for a case that cannot happen. An error you cannot handle propagates; never swallow it or hide it behind a default.
- One job per function, module and file, named after it; never `utils`, `helpers`, `common`, `misc` or `shared`. A unit that wants such a name has two jobs: split it.
- Keep the layers below: imports point down, never up. Code that gets a test takes the time, randomness and I/O it uses as parameters.
- Remove what your change made unused. Leave other code, comments and formatting as they are; name unrelated dead code in the report.
- Comments only where the code cannot say it: one line, the why, not the how.

### Layers

| Package              | Layer                  | Holds                                                            | May import               |
| -------------------- | ---------------------- | ---------------------------------------------------------------- | ------------------------ |
| `packages/contracts` | logic: no Node, no DOM | schemas, generated JSON Schemas, canonical JSON and content hash | nothing of the workspace |
| `packages/scoring`   | logic: no Node, no DOM | rubric loader, scorer, fit labeler                               | `contracts`              |
| `apps/collector`     | Node                   | source adapters, HTTP client, analyzers, the command line        | `contracts`, `scoring`   |
| `apps/site`          | DOM                    | the site                                                         | `contracts`, `scoring`   |

Each package's `tsconfig.json` sets the `lib` and `types` of its layer; every logic package includes [packages/contracts/src/zod-globals.d.ts](packages/contracts/src/zod-globals.d.ts), which declares the part of `URL` that zod's types name. The logic packages leave their `*.test.ts` files to the root `tsconfig.json`, which typechecks them with the Node types the test runner needs. The `no-restricted-imports` overrides in [.oxlintrc.json](.oxlintrc.json) refuse Node imports in logic and the site and imports that point up or across.

## Tests

- Do not add tests by default. Add one only when it fails if your change is reverted, hardcodes its expected values (never computed by production code, locale files or mocks), and runs at the single layer that owns the behavior.
- Never test copy or translations, CSS classes, constants, third-party libraries, private state, timing or call counts. When you touch such a test, delete it instead of updating it.
- There are no coverage thresholds.

## Public content

The repository is meant to go public, so everything written into it is public text from the first commit: commits, branch names, pull request titles and bodies, `REUSE.toml` comments, this file, code comments, the method page and issue forms.

- No reference to a private planning or tracking place: no repository slug, URL, issue number, decision ids, board names or line references into private docs.
- No decision or approval wording ("owner decision", "approved", decision dates) and no local paths.
- License, method and policy text states what holds, in a neutral tone.
- `eikelandin/BenchKeeper` is public and may be named; private repositories may not.

## Naming

The product is the CedarLoom Directory, code name `directory`. Use "Directory" in names and text; never call it an extension index, database, catalog or registry.

## Gates while the repository is private

On GitHub Free a private repository gets no CodeQL, dependency review or Scorecard. Until the repository is public, these substitutes run in `pnpm run check` and CI:

| Gate                               | Substitute                                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CodeQL for workflows               | actionlint and zizmor                                                                                                                                                                                                                                   |
| CodeQL for TypeScript              | Oxlint with typed rules (`oxlint-tsgolint`) as errors and `tsc` strict                                                                                                                                                                                  |
| Dependency review, vulnerabilities | `pnpm audit --audit-level high`                                                                                                                                                                                                                         |
| Dependency review, licenses        | `pnpm run licenses`: [scripts/licenses.ts](scripts/licenses.ts) checks every package installed for the current platform (`pnpm licenses list`) against the allow-list in [.github/dependency-review-config.json](.github/dependency-review-config.json) |

## Licenses

[REUSE.toml](REUSE.toml) maps every path: code and site text ISC, own records, rubrics and curation files CC0-1.0, names and logos `LicenseRef-Brand`. A license text goes into `LICENSES/` with the first file that uses it.
