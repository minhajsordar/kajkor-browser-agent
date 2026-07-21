# Building `desktop-app-hybrid`

How to build the hybrid Electron desktop app. "Hybrid" means a single Electron
binary that bundles **three** things and runs them together offline:

1. The **Vue renderer** (the UI).
2. The **api-inventory Express backend** (bundled to `dist-server/server.cjs`).
3. A bundled **MongoDB server** (`mongod`) that the embedded backend talks to.

So a build is not just `electron-builder` — it must first produce the backend
bundle and fetch a `mongod` binary for the target platform. The npm scripts do
this for you; this doc explains what runs and how to drive it per platform.

---

## Prerequisites

- **Node.js `24.14.0`** — pinned in [`.nvmrc`](.nvmrc). Use `nvm use`.
- **npm** (ships with Node).
- The sibling repo **`../api-inventory`** must be present and have its deps
  installed (`cd ../api-inventory && npm install`). The desktop build bundles
  its backend from there.
- **Internet access** on the first build — `mongod` (~ hundreds of MB) is
  downloaded from `fastdl.mongodb.org`. Subsequent builds reuse the cached copy.
- Platform tooling for the installer you want to produce:
  - **macOS** target → build on macOS (for `.dmg`).
  - **Windows** target → build on Windows (NSIS installer).
  - **Linux** target → build on Linux (AppImage / snap / deb).
  - Cross-building is not supported by this setup; build each OS on its own host.
- Extraction tools used by the mongo fetch script: `tar` + `unzip` on
  macOS/Linux, PowerShell `Expand-Archive` on Windows (all default-installed).

### Mirrors (optional)

[`.npmrc`](.npmrc) points Electron + electron-builder binary downloads at the
npmmirror.com mirror, and [`electron-builder.yml`](electron-builder.yml) sets
`electronDownload.mirror` to the same. Keep these if you are on a slow/blocked
connection; remove them to use the official sources.

---

## Install dependencies

```bash
nvm use            # picks Node 24.14.0 from .nvmrc
npm install        # desktop-app-hybrid deps only

# the sibling backend is NOT installed by the above — do it separately:
cd ../api-inventory && npm install && cd -
```

> `better-sqlite3` and other native modules compile on install. If install
> fails on native build, ensure platform build tools are present (Xcode CLT on
> macOS, build-essential on Linux, Visual Studio Build Tools on Windows).

---

## Full build order (do this in sequence)

Build in **three ordered steps**. Each step's output feeds the next, so the
order matters:

```
frontend  →  backend  →  desktop
```

- **Frontend** builds the web UI into `../api-inventory/production_frontend/`.
- **Backend** bundles the Express server AND copies `production_frontend/` into
  `../api-inventory/dist-server/assets/` (so the embedded server can serve it).
- **Desktop** packages everything (renderer + `dist-server/` + bundled mongod)
  into an installer.

> The desktop `prebuild` re-bundles the backend for you, but it does **not**
> build the frontend. So you must build the frontend first, or the embedded
> server ships without its web assets.

### Step 1 — Build the frontend

```bash
cd ../api-inventory/frontend
npm install            # first time only
npm run build          # → ../api-inventory/production_frontend/
```

### Step 2 — Build the backend bundle

```bash
cd ../api-inventory
npm install            # first time only
npm run build-server:all   # esbuild → dist-server/server.cjs
                           # + copies production_frontend → dist-server/assets/
```

### Step 3 — Build the desktop app

```bash
cd ../desktop-app-hybrid
npm install            # first time only
npm run build:mac      # or build:win / build:linux  → dist/
```

> Step 3's `prebuild` re-runs the backend bundle (Step 2) and fetches `mongod`
> automatically. You still must run **Step 1** yourself beforehand.

### One-liner (current OS)

```bash
( cd ../api-inventory/frontend && npm run build ) \
  && ( cd ../api-inventory && npm run build-server:all ) \
  && ( cd ../desktop-app-hybrid && npm run build:mac )   # swap :mac for your OS
```

---

## What the build does (pipeline)

The build scripts in [`package.json`](package.json) chain together:

```
build  =  prebuild  →  typecheck  →  electron-vite build  →  (electron-builder)

prebuild
 ├─ build-server   →  cd ../api-inventory && npm run build-server
 │                       (esbuild bundles backend → ../api-inventory/dist-server/server.cjs)
 │                    && npm run build-server:copy-assets
 │                       (copies runtime assets next to the bundle)
 └─ fetch-mongo    →  node scripts/fetch-mongo.js
                         (downloads mongod for the host platform into
                          resources/mongo/<platform-arch>/)
```

Then [`electron-builder.yml`](electron-builder.yml) packages everything,
pulling in via `extraResources`:

- `resources/mongo/${platform}-${arch}/`  → app `resources/mongo/`
- `../api-inventory/dist-server/`          → app `resources/server/`

`asarUnpack: resources/**` keeps the mongod binary and server outside the asar
archive so they remain executable at runtime.

---

## Build commands

### Quick syntax / bundle check (no installer)

```bash
npm run build          # prebuild + typecheck + electron-vite build (writes ./out)
```

Produces the runnable app in `out/` but **no** distributable installer.

### Unpacked app (fast, for local testing)

```bash
npm run build:unpack   # build + electron-builder --dir  → dist/ (unpacked)
```

### Platform installers

```bash
npm run build:mac      # .dmg          (run on macOS)
npm run build:win      # NSIS setup    (run on Windows)
npm run build:linux    # AppImage/snap/deb (run on Linux)
```

Each of these runs the full `build` pipeline first, then `electron-builder` for
that target. Output goes to `dist/`.

### Run the built app without packaging

```bash
npm run start          # electron-vite preview (serves the ./out build)
```

---

## Fetching `mongod` manually / for another arch

`fetch-mongo` auto-detects the host platform, but you can override it. Useful to
pre-warm the cache or fetch a different arch:

```bash
node scripts/fetch-mongo.js                       # current host
MONGO_TARGET=mac-arm64  node scripts/fetch-mongo.js
MONGO_TARGET=mac-x64    node scripts/fetch-mongo.js
MONGO_TARGET=win-x64    node scripts/fetch-mongo.js
MONGO_TARGET=linux-x64  node scripts/fetch-mongo.js
MONGO_VERSION=7.0.14    node scripts/fetch-mongo.js   # pin a version (default 7.0.14)
```

The script is idempotent: it writes a `.version-<v>` stamp in the target dir and
skips the download if that version is already present. The binary lands at
`resources/mongo/<target>/mongod[.exe]`. Supported targets: `mac-arm64`,
`mac-x64`, `win-x64`, `linux-x64`.

---

## Development (not a build)

```bash
npm run dev            # electron-vite dev with HMR
```

> Heads up: `dev` does **not** run `prebuild`, so it does not bundle the backend
> or fetch mongod. Run `npm run build-server` and `npm run fetch-mongo` once if a
> dev run needs the embedded server/mongo present.

---

## Versioning the release

Bump `version` in [`package.json`](package.json) before building — installer
artifact names use it (e.g. `pos-inventory-1.0.0-setup.exe`, see the
`artifactName` patterns in `electron-builder.yml`).

Auto-update feed is configured under `publish` in `electron-builder.yml`
(`provider: generic`, `url: https://example.com/auto-updates`) — point this at
your real update host before shipping.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mongod not found at ...` during fetch | MongoDB changed its archive layout, or wrong target | Check `scripts/fetch-mongo.js` `TARGETS[...].binDir`; try a different `MONGO_VERSION` |
| Build fails in `build-server` step | `../api-inventory` missing or deps not installed | `cd ../api-inventory && npm install`, confirm `npm run build-server` works there |
| `dist-server/server.cjs` missing in packaged app | `build-server` skipped (e.g. ran `electron-builder` directly) | Always build via `npm run build:<platform>` so `prebuild` runs |
| Native module errors (`better-sqlite3`) | ABI mismatch / missing toolchain | Reinstall with platform build tools present; `npmRebuild: false` is set, so the prebuilt binary must match Electron's ABI |
| Slow / blocked Electron download | Default CDN unreachable | Keep the npmmirror mirrors in `.npmrc` + `electron-builder.yml` |
| Installer built on wrong OS | Cross-build attempted | Build each platform on its own OS |

---

## Quick reference

```bash
# one-time
nvm use
cd ../api-inventory/frontend && npm install && cd -
cd ../api-inventory && npm install && cd -
npm install            # in desktop-app-hybrid

# build in order: frontend → backend → desktop
( cd ../api-inventory/frontend && npm run build ) \
  && ( cd ../api-inventory && npm run build-server:all ) \
  && npm run build:mac     # or build:win / build:linux
# artifacts → dist/
```
