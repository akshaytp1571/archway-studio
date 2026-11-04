# Contributing to Archway

Welcome. This is a local, single-user architecture studio with a model-first design—not a generic whiteboard or a deployment engine.

Start with [the README](README.md), [architecture](docs/architecture.md), and [development guide](docs/development.md). Coding agents must also read [AGENTS.md](AGENTS.md).

## Before starting

- Work from an authorized checkout. The initial repository is private and no open-source license has been chosen.
- Inspect the current branch and working tree; preserve unrelated work.
- For a substantial feature, agree on the problem, scope, model/API impact, and acceptance criteria with the maintainer first.
- Read [security guidance](SECURITY.md) before working on authentication, provider settings, persistence, remote access, or agent permissions.

## Development workflow

```sh
npm ci
git switch -c your-topic
npm run dev
```

Use a separate port and data directory if an instance is already running. Do not test against live user data. The [development guide](docs/development.md) has cross-platform commands.

Make the smallest coherent change. Put semantic rules in the [shared engine](shared/model.ts), not only in UI handlers or one transport adapter. Adding a new operation requires schema, semantic validation, REST/MCP compatibility, negative-case tests, and documentation.

## Quality checks

```sh
npm run format
npm run docs:generate
npm run verify
npm run test:browser
```

The browser suite needs built assets and Chromium. It uses a temporary project store and a mock provider. Report skipped checks and reasons honestly.

Keep [generated schemas and examples](docs/reference/README.md) current. [Documentation checks](scripts/check-docs.ts) validate local Markdown destinations; they do not certify remote links or architecture quality.

## Pull requests

A good PR explains:

1. The user or agent problem and the chosen scope.
2. Model, API, UI, persistence, security, or migration effects.
3. Tests actually run and observed outcomes.
4. Relevant screenshots using sample data only.
5. Documentation changes and known limitations.

Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Prefer focused conventional commits, for example `docs: explain revision-safe agent edits` or `fix: preserve omitted component patch fields`.

Never commit keys, provider settings, local project data, dependencies, compiled output, or raw test artifacts. Do not force-push shared branches or alter publishing visibility without permission.

## Review expectations

- Stable IDs and per-view layouts remain intact.
- Preview is read-only; apply is atomic and revision-checked.
- Warnings are not promoted into invented production-health guarantees.
- Destructive changes are explicit and undoable where supported.
- Human edits and agent edits use the same model engine.
- Privacy and local-only deployment assumptions are documented, not hidden.

## License and public release

No open-source license has been granted for this project. Authorized collaborators may work within the owner's permissions; do not assume redistribution rights. Selecting a license, public visibility, a contribution policy for outside contributors, and hosted-release safeguards are owner decisions.
