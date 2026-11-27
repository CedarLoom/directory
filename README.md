# CedarLoom Directory

[![Sponsor](https://img.shields.io/badge/Sponsor-eikelandin-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/eikelandin)
[![CI](https://github.com/CedarLoom/directory/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CedarLoom/directory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](REUSE.toml)

The CedarLoom Directory lists plugins, skills and other extensions for Claude Code with links to their sources, published facts and a score from an open rubric, so you can find one that fits and see why it scored as it did.

| Path                 | Holds                                             |
| -------------------- | ------------------------------------------------- |
| `packages/contracts` | record schemas, canonical JSON and content hash   |
| `packages/scoring`   | rubric loader and scorer                          |
| `apps/collector`     | reads the sources and writes the records          |
| `apps/site`          | the site                                          |
| `rubrics`            | the released rubric of each kind and their hashes |

Development: [AGENTS.md](AGENTS.md) lists the commands and rules. Licenses: [REUSE.toml](REUSE.toml).
