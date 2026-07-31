# Dependency audit triage

`docs/product/release-checklist.md` requires `pnpm audit` to be clean **or
every finding triaged in writing**. This is that writing.

CI fails only on `critical`, which is a deliberately low bar: it stops the
build on the findings nobody should ever wave through, and leaves the
judgement calls to this file. A finding is not resolved by being non-critical.

**Last reviewed: 2026-07-31**, against `pnpm audit` at that date.
Re-run and re-review this file before every release.

## How to decide

The question is never "how bad is the CVE", it is **can it reach this app, on
this practitioner's machine, with the data she keeps in it**. Three outcomes:

- **Ships** — the package is inside the packaged application. Fix it, or
  justify it here in detail.
- **Build-time only** — the package is used by the toolchain (Forge CLI,
  eslint, test runner) and is not in the ASAR. It runs on a developer or CI
  machine against inputs we control. Lower priority, but not zero: a
  compromised build machine signs the artifact she installs.
- **Not reachable** — the vulnerable code path is never executed in this
  configuration. Requires naming the specific reason, not a general feeling.

## Current findings

`pnpm audit` — 4 findings: 2 high, 1 moderate, 1 low. **None ship.**

| Severity | Package           | Advisory                                                                 | Reaches the app?                                                                                                                                                                                                                                    |
| -------- | ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| high     | `tmp`             | [GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65) | No. `@electron-forge/cli > @inquirer/prompts > @inquirer/editor > external-editor > tmp` — the Forge CLI's interactive prompt. Reached only by a developer answering a prompt on their own machine, with a prefix we never supply. Not in the ASAR. |
| high     | `brace-expansion` | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | No. `eslint > minimatch > brace-expansion`, 209 paths. Lint-time glob expansion over patterns committed in this repo. DoS against our own CI at worst. Not in the ASAR.                                                                             |
| moderate | `tar`             | [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m) | No. Reached through `@electron/rebuild > @electron/node-gyp` when unpacking prebuilt binaries during install. The archives come from pinned registry/GitHub-release URLs, not from user input. Not in the ASAR.                                     |
| low      | `tmp`             | [GHSA-52f5-9888-hmc6](https://github.com/advisories/GHSA-52f5-9888-hmc6) | No. Same path and same reasoning as the high `tmp` finding.                                                                                                                                                                                         |

None of these are directly installed by this project — every one arrives
through Electron Forge or eslint, so the fix is upstream. They clear when
those tools update their own trees; we do not pin around them, because
overriding a transitive dependency of the build toolchain is more likely to
break packaging than the finding is to hurt anyone.

## Resolved

**`electron` — [GHSA-532v-xpq5-8h95](https://github.com/advisories/GHSA-532v-xpq5-8h95), use-after-free in the offscreen child-window paint callback. Fixed 2026-07-31 by upgrading Electron 38.8.6 → 42.8.0.**

This one **shipped**, which is why it was fixed rather than triaged away. It
is worth recording that it was probably not reachable here either — offscreen
rendering is never enabled anywhere in the source, and `security.ts` denies
every `setWindowOpenHandler` call, so the app has no child windows at all, and
the bug needs both. That analysis is what would have justified deferring the
upgrade; it is **not** what justified doing it. A vulnerability in code that
ships gets fixed while the reasoning is cheap, because "not reachable today"
quietly becomes false the first time someone adds a feature.

Target selection is constrained from both ends:

- Electron supports only the latest three majors. Upgrading to the minimum
  that clears the advisory (39.8.1) would have landed on an **already-EOL**
  branch that never receives another patch — fixing this CVE by moving
  somewhere that cannot receive the next one.
- `better-sqlite3-multiple-ciphers@12.11.1` publishes prebuilt binaries only
  up to **ABI 146 = Electron 42**. Electron 43 needs ABI 148 and 404s, which
  would force a from-source build with a full MSVC/node-gyp toolchain on all
  three CI runners.

**Electron 42 is therefore the only correct target**, and this constraint will
recur: the ceiling is set by the SQLite driver's prebuild matrix, not by
Electron. Before the next Electron upgrade, check
`https://api.github.com/repos/m4heshd/better-sqlite3-multiple-ciphers/releases/tags/v<version>`
for the available `electron-v<abi>` assets first, and pick the target from
that list.

## Gotcha: `pnpm sbom` is now a built-in

pnpm 11 added its own `sbom` command, which **shadows the `sbom` script in
package.json**. `pnpm sbom` silently runs pnpm's builtin and prints help; the
SBOM is not regenerated and the stale file looks fine. Use `pnpm run sbom`.
This was caught here because the regenerated SBOM still reported Electron
38.8.6 after the upgrade.
