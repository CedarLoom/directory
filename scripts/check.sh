#!/bin/sh
# Runs every gate of the repository: the npm tools of package.json and the tools of tools/requirements.txt.
set -eu
cd "$(dirname "$0")/.."

if ! command -v uvx >/dev/null; then
  echo "check: uvx is missing (https://docs.astral.sh/uv/)" >&2
  exit 2
fi

step() {
  echo "==> $1"
  shift
  "$@"
}

tool() {
  uvx --constraints tools/requirements.txt "$@"
}

step typecheck pnpm run typecheck
step lint pnpm run lint
step format pnpm run format:check
step test pnpm run test
step knip pnpm run knip
step jscpd pnpm run jscpd
step licenses pnpm run licenses
step audit pnpm audit --audit-level high
# One process: a process pool needs semaphores that some sandboxes do not grant.
step reuse tool --from reuse --with charset-normalizer reuse --no-multiprocessing lint
# In CI the reusable gates workflow runs typos, actionlint and zizmor, each once and at its own pinned version.
if [ -n "${CI:-}" ]; then
  echo "==> typos, actionlint, zizmor: skipped, the gates workflow runs them in CI"
  echo "check: all gates passed"
  exit 0
fi
step typos tool typos
# actionlint fails when there is no workflow to read.
if [ -d .github/workflows ]; then
  step actionlint tool --from actionlint-py actionlint
else
  echo "==> actionlint: skipped, no .github/workflows"
fi
# Online audits run when GH_TOKEN is set; otherwise zizmor runs the offline ones.
step zizmor tool zizmor .
echo "check: all gates passed"
