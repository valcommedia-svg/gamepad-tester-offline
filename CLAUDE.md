# GamePad Tester Offline

Offline Windows + macOS app (Electron) for testing and calibrating PlayStation controllers
(DualShock 4, DualSense, DualSense Edge, PS VR2). It runs the UI and calibration logic of
https://dualshock-tools.github.io/ (dualshock-tools, MIT) with offline patches, and adds an own
"any gamepad" test page (`extra/`). See `README.md` for the user-facing description.

## Working with the owner

- The owner writes Russian: reply in Russian. Code, comments and commit messages stay English.
- Commit locally as you like, but **ask for an explicit "yes" before every `git push` and every
  release tag** (a `v*` tag publishes a public GitHub release). Approval is per action. Push to
  `main` first (CI runs, no release), tag only after CI is green.
- Git identity is not stored in the repo. On a new machine set it in the clone:
  `git config user.name` / `git config user.email` (ask the owner which to use; the address becomes
  public in history).
- Windows PowerShell 5.1 pitfalls: a commit message containing double quotes breaks when passed with
  `-m`; write it to a file and use `git commit -F <file>`, and write that file without a BOM.

## Commands

```
npm ci                    # install (Electron, electron-builder, vendored bootstrap/jquery/fontawesome)
npm run build:web         # fetch upstream at the pinned commit, patch, build into web/, verify no network refs
npm start                 # run the app
npm test                  # unit tests (node:test)
npm run smoke             # end-to-end self-test of the app from source (screenshots in smoke-output/)
npm run smoke:packaged    # the same on the built app in release/
npm run dist:win          # installer + portable -> release/
npm run dist:mac          # universal dmg, only works on macOS
```

If `npm start` says Electron failed to install, run `node node_modules/electron/install.js`
(npm may skip the install script; CI does this explicitly).

After any change: `npm test`, `npm run build:web`, `npm run smoke`.
`upstream/`, `web/`, `release/`, `node_modules/` are generated and git-ignored.

## How it is built

- `scripts/upstream.json` pins the upstream commit. `scripts/build-web.mjs` fetches it, applies
  `scripts/patches.mjs`, runs upstream's own gulp build, copies `extra/`, vendors the libraries.
- Every patch declares how many matches it expects. If upstream changes and a count no longer
  matches, the build fails on purpose: fix the patch, never loosen the check.
- `electron/main.js` serves `web/` on the secure custom scheme `app://ds/`, blocks every
  http(s)/ws request, grants only a short permission allow-list (`hid`, `media`, `fullscreen`,
  clipboard write) and only to its own origin, and provides the WebHID device chooser.
  `electron/diagnostics.js` backs Help > Copy diagnostics (no serial numbers, no paths).
- `electron/smoke-test.js` drives the real window, including the gamepad page with a synthetic
  `navigator.getGamepads()`.
- CI (`.github/workflows/build.yml`): unit tests, source smoke test, packaging, smoke test of the
  packaged app, and on macOS mounts the built dmg, verifies the signature and launches it from there.
  A `v*` tag attaches the installers to a GitHub Release.

## Conventions and limits

- Never use Sony/PlayStation imagery. Upstream's 512 px PWA icon is a DualShock 4 photo; the app icon
  is our own `build/icon.svg` (regenerate with `npm run icon`).
- The bottom bar of upstream's page is removed on purpose; credits live in Help > About and
  `THIRD_PARTY_NOTICES.md` (MIT requires keeping the notice).
- Builds are unsigned: SmartScreen warns on Windows, macOS gets an ad-hoc signature
  (`build/adhoc-sign.cjs`) and needs "Open Anyway".

## What is NOT verified

- No real controller was ever connected: WebHID open/calibration and the gamepad page's vibration
  and update-rate readings are untested on hardware (only with synthetic data).
- The macOS build was only ever run on the CI runner, never on a real Mac (Gatekeeper flow,
  microphone permission).

## Release history

v1.0.0, v1.0.1 (footer removed, Help > About), v1.1.0 (universal dmg, packaged-app tests in CI,
Help > Copy diagnostics). v1.2.0 (any-gamepad page) is in `package.json` but not yet released.
Open idea: a weekly workflow that bumps the pinned upstream commit and opens a pull request (needs the
repo setting "Allow GitHub Actions to create and approve pull requests").
