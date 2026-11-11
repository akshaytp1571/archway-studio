# Changelog

Changes are recorded here when shipped. Planned work belongs in [the roadmap](docs/roadmap.md), not in this release history.

## Unreleased

- Publish the source repository publicly under MIT, keeping local data, credentials, dependencies, and generated artifacts excluded.

- Add explicit provider connection tests, cancellation, bounded response-body timeouts, and sanitized error regressions.
- Enable owner-approved pinned CI checks locally, including milestone flows and synthetic performance diagnostics.
- Add canonical partial view updates, visual view/boundary editors, versioned named snapshots, canonical backups, and atomic reviewed restore.
- Add field-level proposal diffs, advisory explanations, keyboard semantic search/canvas inspection, and maximum-size synthetic measurement tools.
- Add one local JSON inventory adapter producing validated review-before-apply additions/updates without execution or cloud access.

- Prevent delayed provider-settings reads or errors from overwriting a later successful save.
- Require explicit credential reuse confirmation when switching provider endpoints or copying an environment key into local settings; support explicit replacement and clearing.
- Add provider/API/browser regression coverage and a prioritized local-first improvement roadmap.

- Adopt the MIT open-source license, add the SPDX package/lockfile metadata, and update contribution and coding-agent guidance. Licensing is independent of repository visibility.

- Prevent quick-find from replacing an active/saving dialog; browser checks wait for creation dialogs to finish.
- Normalize Git text line endings for reproducible Windows/Linux checkouts.

- Change-request JSON schemas now describe accepted input/defaults consistently in REST, MCP, and offline references.

- Human and coding-agent onboarding, architecture/model/API/configuration references, security policy, contribution guidance, and a design decision record.
- Generated offline JSON schemas and sample model/change documents, with automated documentation checks.
- Portable Chromium discovery for browser tests and a non-disruptive alternate web-build directory.
- A commit-pinned GitHub Actions template, deliberately not activated without the required publishing permission.

## 0.1.0 — 2026-11-04

- Standalone React/TypeScript/React Flow architecture workspace.
- Typed components, boundaries, relationships, views, stable IDs, and semantic validation.
- Atomic local persistence, revisions, preview/apply, undo/redo, history, and live events.
- Templates, visual editing, inspector, impact analysis, automatic layout, and search.
- Canonical JSON import/export, SVG export, and Mermaid export.
- OpenAI-compatible proposal planning and explicitly labeled no-LLM recipes.
- REST API and six Streamable HTTP MCP tools.
- Automated model/API/provider tests and isolated end-to-end browser checks.

**Release boundary:** local, single-user use only. Authentication, project permissions, encrypted provider storage, deployment execution, and code/cloud discovery are not part of this release.
