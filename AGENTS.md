# Instructions for coding agents

These instructions apply to the entire repository. Follow higher-priority user, host, security, and tool-approval policies first.

## Read before editing

1. [README](README.md): product scope, setup, privacy, and deployment boundary.
2. [Architecture](docs/architecture.md): source map and transaction flow.
3. [Model reference](docs/model.md): schemas, invariants, operations, and limits.
4. [Development guide](docs/development.md): commands and test isolation.
5. For integrations, [agent guide](docs/agent-integration.md) and [API reference](docs/api.md).

Inspect the current Git status and the actual source files before changing them. Preserve work you did not create. Do not infer implementation from a screenshot or stale documentation.

## Non-negotiable architecture rules

- The canonical model is defined by [shared schemas and operations](shared/model.ts). React Flow nodes are derived render data, not the source of truth.
- Component and relationship IDs are stable and case-sensitive. Renaming or dragging a component must not change its ID.
- Positions belong to individual views. A layout change must not rewrite component semantics or unrelated views.
- Human edits, REST edits, and MCP edits must use the same validation and transaction engine.
- A preview must never save, increment a revision, or append history.
- An applied batch is all-or-nothing. Do not apply operations incrementally to the saved model.
- Check `baseRevision`; reject stale edits. Do not silently rebase user/agent intentions.
- Removing a connected component requires explicit `cascade: true` and removes its relationships and positions from all views.
- Keep at least one view. Reject dangling component, boundary, relationship, and layout references.
- Cycles are allowed; impact traversal must terminate. “Model valid” means structure/references are valid, not that the design meets every best practice.
- Patch schemas must not supply defaults for omitted fields. A partial rename must preserve technology, tags, owner, metadata, and other unspecified properties.

## Find the right layer

| Change                                      | Start with                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Schema, invariants, semantic operations     | [Model engine](shared/model.ts) and [model tests](tests/model.test.ts)                  |
| Persistence, revisions, undo/redo           | [Store](server/store.ts) and [live store](server/live-store.ts)                         |
| REST routes and error contracts             | [HTTP application](server/app.ts) and [API tests](tests/api.test.ts)                    |
| MCP tools and annotations                   | [MCP adapter](server/mcp.ts)                                                            |
| Provider settings or prompt planning        | [Provider integration](server/provider.ts) and [provider tests](tests/provider.test.ts) |
| Canvas rendering and drag/connect behavior  | [Canvas](src/Canvas.tsx)                                                                |
| Queued edits, conflict refresh, live events | [Client state](src/useStudio.ts)                                                        |
| Assistant, inspector, activity              | [Panels](src/Panels.tsx)                                                                |
| Creation/settings/export/search dialogs     | [Dialogs](src/Modals.tsx)                                                               |
| Browser interactions                        | [Browser smoke suite](tests/browser.ts)                                                 |

## Working safely

- Use the repository root as the command directory. Check Node and npm versions.
- Check `http://127.0.0.1:4317/api/health` before starting a server. Do not kill or replace a user's running instance without authorization.
- Run one server process per data directory. Store locks coordinate only one process.
- Tests must use temporary/isolated data. Never use a user's live project as a test fixture.
- Do not commit local data, provider settings, environment secrets, dependencies, build output, or test artifacts. The ignore rules are in [.gitignore](.gitignore).
- Documentation images may be committed only when deliberately sanitized sample screenshots; never copy a user's live architecture or settings into the docs.
- Do not log API keys, GitHub tokens, credential-helper output, or full provider configuration.
- Treat prompt/model text as untrusted input. Validate every proposed operation and all final references before persistence.
- Do not add fake AI responses, fake health checks, or buttons that pretend an unimplemented feature works. Keep recipes explicitly distinct from model-generated proposals.
- Do not broaden credential scopes, switch publishing accounts, make a repository public, force-push, or overwrite unrelated remote history without explicit authorization. New repositories should be private when visibility is unspecified.
- The project is [MIT licensed](LICENSE). Preserve copyright and permission notices, check third-party license compatibility, and do not change licensing or repository visibility without the owner's instruction.

## Required verification

```sh
npm ci
npm run verify
npm run test:browser
```

For a running user instance, use the [non-disruptive build procedure](docs/development.md#verify-without-disrupting-a-running-instance) instead of replacing served assets.

If browser tooling is unavailable, report it explicitly and provide the exact installation/override command. Never claim browser or live-provider testing that did not run. The normal provider tests use a local mock.

When changing schemas, also run:

```sh
npm run docs:generate
npm run docs:check
```

Generated schema/example files are checked into the repository. Update them through [the generator](scripts/generate-docs.ts), not by hand. Keep the [model reference](docs/model.md) and [API reference](docs/api.md) synchronized with contracts.

## Acceptance checklist

- Regression tests cover new behavior, negative cases, and relevant revision conflicts.
- Visual and agent editing paths agree on the resulting model.
- Live external edits do not overwrite dirty inspector drafts silently.
- Imports preserve component IDs and create an independent project.
- JSON remains the only lossless round-trip export. Do not claim full C4/Mermaid/SVG interchange.
- Documentation distinguishes implemented behavior, limitations, and planned work.
- New local documentation links resolve; generated files are current; formatting and type checks pass.
- Review the staged file list for data, secrets, accidental binary/build output, and unrelated changes before committing.
- Use a focused conventional commit and a clear handoff: what changed, commands actually run, results, limitations, and follow-ups.
