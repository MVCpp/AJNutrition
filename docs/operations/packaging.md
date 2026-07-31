# Packaging and distribution

How a NutriPlan build becomes something a practitioner can install, on each OS,
and what is still missing before that is true.

`apps/desktop/forge.config.ts` references this file. Both targets are built by
Electron Forge; neither can be cross-built.

## State of play

|                                    | Windows                                   | macOS                        |
| ---------------------------------- | ----------------------------------------- | ---------------------------- |
| Builds                             | ✅                                        | ✅ (CI, arm64)               |
| Installer produced                 | ✅ `NutriPlan-Setup.exe`                  | ✅ `.dmg` (CI, **unsigned**) |
| Signed                             | ⬜ needs a code-signing certificate       | ⬜ needs Apple Developer ID  |
| Notarized                          | n/a                                       | ⬜ needs the above           |
| Installs cleanly on a real machine | ⬜ **S-113**                              | ⬜ **S-114**                 |
| App icon                           | ⬜ none — ships the default Electron icon | ⬜ same                      |

Neither OS is releasable yet, and for the same two reasons: **nobody has
installed a build on a real machine, and nothing is signed.**

## Building

Both must be built **on the OS they target**. Cross-building a signed,
notarized macOS app from Windows or Linux is not possible, and an unsigned
cross-build is not worth having.

```bash
pnpm --filter @ajnutrition/desktop package   # unpacked app
pnpm --filter @ajnutrition/desktop make      # installer / DMG
node scripts/verify-package.mjs apps/desktop/out   # structural check
```

CI packages on both Windows and macOS on every push, and additionally runs
`make` on macOS, uploading the DMG as **`nutriplan-macos-UNSIGNED-dmg`** with a
14-day retention. That artifact is how S-114 can be smoke-tested on a Mac
without owning one to build on.

## macOS

### Architecture

CI runs on `macos-latest`, which is **Apple Silicon (arm64)**, so the DMG it
produces is arm64-only. It will not run on an Intel Mac.

If an Intel Mac needs to be supported, the options are a second `--arch=x64`
build or a universal binary (`osxUniversal`). Universal roughly doubles the
download, and the encrypted SQLite driver must have a prebuild for both
architectures — it does today, for ABI 146 = Electron 42
(`docs/security/dependency-audit.md` explains why that ABI is the ceiling).

**Decide this from the practitioner's actual Mac before building anything for
her.** Guessing wrong produces an app that will not open at all.

### Signing and notarization

Neither is possible without an **Apple Developer Program** membership
(US$99/year) and a _Developer ID Application_ certificate installed in the
build machine's keychain. There is no way around this: since macOS Catalina,
Gatekeeper blocks unsigned and un-notarized apps, and the message a
practitioner sees is "NutriPlan is damaged and can't be opened", which is both
alarming and wrong.

Everything else is already wired. Signing switches on through the environment
so no credential ever reaches the repository:

```bash
AJN_OSX_SIGN=1 \
APPLE_ID=you@example.com \
APPLE_PASSWORD=<app-specific password, NOT your Apple ID password> \
APPLE_TEAM_ID=XXXXXXXXXX \
pnpm --filter @ajnutrition/desktop make
```

`APPLE_PASSWORD` must be an **app-specific password** generated at
appleid.apple.com, not the account password.

`apps/desktop/build/entitlements.mac.plist` carries the hardened-runtime
entitlements notarization requires. They are applied to every binary in the
bundle including the helpers — signing the helpers without the JIT entitlements
produces an app that notarizes cleanly and then crashes on launch, which is a
miserable thing to debug.

The app deliberately does **not** request the App Sandbox: this is a Developer
ID build distributed directly, and the sandbox would break the practitioner
choosing where her encrypted backups are written.

### What macOS does NOT need here

The app uses its own scrypt/keyfile key hierarchy (ADR-0006) and never touches
`safeStorage`, so there is no Keychain integration to get right and no
macOS-specific behaviour in the security model. The same code protects the
database identically on both operating systems.

## Windows

`MakerSquirrel` produces a per-user installer needing no admin rights.

**`authors` in `forge.config.ts` is still the placeholder `'NutriPlan'`.** That
string becomes the Windows "Publisher" shown during installation and in
Add/Remove Programs. Change it to the practice's legal name before any build
goes to anyone.

Windows signing needs a code-signing certificate (OV or EV). Without one,
SmartScreen warns on first run until the download builds reputation; an EV
certificate skips that wait.

## The app icon

There is no icon. Both platforms ship the default Electron icon — a grey
lattice — which appears in the dock, the taskbar, the DMG window, Finder,
Add/Remove Programs and the installer.

This needs a source image; it is not something to invent. Once one exists:

- macOS wants `.icns` (1024×1024 source)
- Windows wants `.ico` (256×256 and smaller sizes embedded)

Add `icon: path.join(__dirname, 'build', 'icon')` to `packagerConfig` —
Forge appends the right extension per platform.

## Before distributing anything

Work through `docs/product/release-checklist.md`. The items that bite hardest
on a first release are the signing ones above and, on both platforms, actually
installing the artifact on a machine that has never run a development build.
