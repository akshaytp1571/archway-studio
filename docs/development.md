# Development, testing, and CI

Read [architecture](architecture.md), [model contracts](model.md), and [contributing](../CONTRIBUTING.md) before changing the system. Coding agents must also read [AGENTS.md](../AGENTS.md).

## Requirements

- Node.js 22.12+ and npm; Node.js 24 is the primary development version.
- A checkout or fork of the public GitHub repository.
- A Chromium browser for the end-to-end suite. No real provider key is needed for tests.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4317`. The development server uses Vite middleware and HMR on the same HTTP listener as the API. There is no second web port to start.

For compiled local assets:

```sh
npm run build
npm run start
```

Production mode changes asset serving and CSP, not the local-only/security boundary.

## Reuse or isolate a running instance

Check `/api/health` before starting another server. One process may write each data directory; two listeners on different ports still must not share a data directory.

PowerShell:

```powershell
$env:PORT = '4320'
$env:ARCHWAY_DATA_DIR = "$env:TEMP\archway-dev-isolated"
npm run dev
```

POSIX shell:

```sh
PORT=4320 ARCHWAY_DATA_DIR="${TMPDIR:-/tmp}/archway-dev-isolated" npm run dev
```

The server accepts ports 1024–65535, not port zero. Tests create their own ephemeral listeners directly and do not use the normal server entry.

## Commands

| Command                                   | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `npm ci`                                  | Install the lockfile-defined dependencies                         |
| `npm run dev`                             | Standalone dev server with Vite HMR and server-source watching    |
| `npm run check`                           | Strict TypeScript check without emitting source                   |
| `npm test`                                | Node model/API/provider/documentation tests                       |
| `npm run build`                           | Type-check and compile client assets                              |
| `npm run start`                           | Serve compiled assets locally                                     |
| `npm run test:browser`                    | Isolated, real Chromium interaction checks against built assets   |
| `npm run format` / `npm run format:check` | Format/check source, repository documents, and metadata           |
| `npm run docs:generate`                   | Regenerate offline schemas and synthetic examples                 |
| `npm run docs:check`                      | Check generated-file drift and local Markdown destinations        |
| `npm run verify`                          | Formatting, docs, types, automated tests, and normal client build |

Source scripts are declared in [the package manifest](../package.json). Avoid using undocumented commands from memory.

## Browser tests

[The browser suite](../tests/browser.ts) serves built assets from an isolated HTTP app and creates a temporary data store. It covers editing, dragging, connecting, views, proposal review/apply, undo/redo, mocked provider planning, export/import, project creation, search/deletion, refresh persistence, external edits, stale drafts, and mobile navigation.

Browser selection:

1. Explicit `ARCHWAY_BROWSER_PATH`, when provided; a wrong override fails rather than silently falling back.
2. Installed Google Chrome or Microsoft Edge on Windows.
3. Playwright's installed bundled Chromium on other systems or when no Windows browser is found.

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

Linux CI may need system packages; the CI template uses `npx playwright install --with-deps chromium`. On a developer machine, review installation requirements before adding system packages.

PowerShell override:

```powershell
$env:ARCHWAY_BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

The suite uses a local mock provider, not paid inference. Screenshots and the sample export go into the ignored artifacts directory. Never publish unsanitized user data as a test artifact.

## Verify without disrupting a running instance

A normal build replaces the default compiled asset directory. If a user is actively using that server, verify into a separate ignored output directory instead:

```sh
npm run format:check
npm run docs:check
npm run check
npm test
npx vite build --outDir artifacts/verification-dist
```

Then point the isolated browser suite at that build.

PowerShell:

```powershell
$env:ARCHWAY_BROWSER_DIST = 'artifacts/verification-dist'
npm run test:browser
```

POSIX shell:

```sh
ARCHWAY_BROWSER_DIST=artifacts/verification-dist npm run test:browser
```

Do not delete or overwrite a computed output/data path without confirming its resolved target. Restore shell overrides when finished if later commands should use the default build.

## GitHub Actions

The owner-approved [active workflow](../.github/workflows/ci.yml) and [template](ci/github-actions.yml) use commit-pinned actions, read-only contents permissions, cross-platform verification, and a Linux Chromium job. Existing credentials already have workflow permission; no scope expansion or account switch was performed. Hosted execution requires committing/pushing changes. A local workflow file is not evidence of a hosted pass.

The browser job runs the existing smoke suite, `npm run test:milestones`, `npm run benchmark`, and `npm run test:performance`, and uploads synthetic artifacts. Do not publish user architectures or keys. Timing measurements are diagnostics, not flaky threshold gates.

## Additional milestone checks

```sh
npm run test:milestones
npm run benchmark
npm run test:performance
```

All browser suites use `ARCHWAY_BROWSER_DIST` for an isolated build and `ARCHWAY_BROWSER_PATH` when explicitly provided. See [performance](performance.md), [snapshots](snapshots.md), and [inventory](inventory.md).

### Windows temporary-file isolation

If a build reports an OS temporary-file deletion denial, an isolated workspace temp directory can avoid disturbing global permissions. Confirm the absolute target before use; the following only changes variables for the current shell, not system permissions:

```powershell
$temporary = Join-Path (Get-Location) 'artifacts/validation-temp'
New-Item -ItemType Directory -Force $temporary
$env:TMP = $temporary
$env:TEMP = $temporary
$env:TMPDIR = $temporary
npm run verify
```

Do not reuse a live data directory for tests. Restore prior shell variables when finished or use a fresh shell. This is isolation, not a Windows permissions repair.

## Troubleshooting

- **Port already in use:** reuse the intended app or select another port and isolated data directory; do not kill unrelated listeners.
- **Missing browser:** install Playwright Chromium or set a valid explicit browser path. Do not skip browser checks and report them as passed.
- **Missing built assets:** build first or set the documented alternate browser build directory.
- **Provider not configured:** recipes still work. Set a compatible base URL/model/key as described in [configuration](configuration.md).
- **Provider 401/404/JSON failure:** check base URL, model, key, chat-completions compatibility, and JSON-object output support. Saving settings is not a connection test.
- **409 during an edit:** re-read/review rather than blindly retrying at a newer revision.
- **Schema-reference drift:** run `npm run docs:generate`, review the diff, then run docs checks.
- **Build chunk-size/third-party annotation warnings:** distinguish non-fatal bundler warnings from a failed build. Do not hide failures by suppressing exit codes.

Use [the security policy](../SECURITY.md) for sensitive reports and [the PR template](../.github/PULL_REQUEST_TEMPLATE.md) for review handoff.
