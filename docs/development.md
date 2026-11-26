# Development

IOUinator is a TypeScript pnpm workspace. One Preact build runs in the browser and inside the Electron app. [Architecture](architecture.md) explains the layout, and the [product requirements](plans/prd.md) say exactly how everything behaves.

## Getting set up

You need Node 22.18 or later, pnpm (through corepack) and [just](https://github.com/casey/just). Run `just` on its own to list every recipe.

```bash
just setup   # corepack enable, then pnpm install
```

### Running it

| Recipe | What it runs |
| --- | --- |
| `just run-web` | The web client on http://localhost:5173 with hot reload |
| `just preview-web` | The built web client as a static site |
| `just run-desktop` | The desktop app (builds the web client first) |
| `just run-desktop-headless` | The desktop app with `--headless`: no window, Dock icon, sound or dialog, on `./.headless-data`, with DevTools on port 9338 (for automated checks) |

To try the desktop app on a throwaway profile, set `IOUINATOR_USER_DATA` to another folder:

```bash
IOUINATOR_USER_DATA=/tmp/iouinator-try just run-desktop
```

## Checking your work

```bash
just check        # everything CI runs: format, lint, typecheck, tests, build
just test         # the tests once (pass a file or -t "name" to narrow them)
just test-watch   # the tests in watch mode
just check-arch   # the architecture rules only
just fuzz         # random ledgers flattened and checked on 500 seeds (FUZZ_SEED=<n> repeats one)
just e2e          # browser scenarios against the built web client
just e2e-desktop  # the desktop app, headless, on a throwaway profile
```

`just check` must pass before every commit. The browser scenarios run on port 8798.

## The app icon

The icon is drawn by hand in `assets/icon.svg`: three people joined by arrows in a loop, on a green tile, on Apple's icon grid (an 824-unit tile at 100,100 on a 1024 canvas). After editing it, render the platform files and commit them, so builds don't need Inkscape:

```bash
just icons  # icon.icns (macOS), icon.ico (Windows) and icon.png in apps/desktop/build
```

## Packaging

```bash
just package-desktop      # .dmg and .zip on macOS, .exe on Windows, AppImage on Linux, in apps/desktop/release
just package-desktop-dir  # an unpacked app only, faster
just install-desktop      # macOS: package and copy to /Applications; the old copy goes to the Trash. If IOUinator is running, it asks to quit it and reopens it afterwards
```

Packaging flips Electron's fuses before signing (`electronFuses` in `apps/desktop/electron-builder.yml`): the packaged app can't be run as plain Node (`ELECTRON_RUN_AS_NODE`), ignores `NODE_OPTIONS` and `--inspect`, doesn't give `file://` pages extra rights, and loads its code only from `app.asar`, which it checks against the hash recorded when it was packaged. Check them with `npx @electron/fuses read --app apps/desktop/release/mac-arm64/IOUinator.app`.

The macOS app gets an ad-hoc signature and isn't notarized, so the first start needs **Open Anyway** in System Settings → Privacy & Security.

## Releasing

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`. It packages the desktop app on macOS (Apple silicon and Intel), Windows and Linux, and publishes them on a GitHub release.

1. Set the same version in every `package.json` (the root, `apps/*` and `packages/*`). The workflow stops if the tag doesn't match `apps/desktop/package.json`.
2. Add a `## X.Y.Z` section to `CHANGELOG.md`. It becomes the release notes.
3. Run `just check`, commit, then tag and push:

   ```bash
   git tag -a vX.Y.Z -m "IOUinator X.Y.Z"
   git push origin main vX.Y.Z
   ```

The desktop app's update check (PRD §12) reads the latest release from GitHub, so a published release reaches existing installs within a day.
