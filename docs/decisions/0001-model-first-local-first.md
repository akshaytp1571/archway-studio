# ADR 0001: a model-first, local-first architecture studio

- **Status:** accepted for the 0.1.x MVP
- **Date:** 2026-11-04

## Context

We want an attractive visual builder that both humans and agents can understand and edit reliably. Free-form drawing files and images are easy to sketch with but do not inherently encode stable component identities, directed dependencies, validation rules, or safe concurrent edits.

Existing architecture-as-code tools are valuable references. For a custom drag-and-drop product, reusing a canvas library is more practical than implementing selection, dragging, handles, zoom, and viewport behavior from scratch.

## Decision

1. Use a typed, schema-validated JSON project as the source of truth.
2. Keep components, relationships, boundaries, and views in one semantic model; store positions per view.
3. Reuse React Flow for rendering/interaction and Dagre for layout.
4. Put validation and immutable operation application in a shared TypeScript engine.
5. Route human, REST, and MCP edits through the same revision-checked project store.
6. Separate proposal preview from persistence. Provider output is an untrusted proposal, not an automatic write.
7. Start with loopback-only, single-process local persistence and snapshot history; defer hosted multi-user/security infrastructure explicitly.
8. Publish REST/MCP contracts and generated offline schemas so agents need not infer topology from pixels.

## Consequences

### Benefits

- One consistent model across UI, exports, transports, and tests.
- Stable IDs support minimal edits, dependency analysis, and understandable diffs.
- Preview/apply and revision checks reduce stale or partially applied changes.
- Local use and no-LLM recipes make the MVP usable without accounts or paid inference.
- Canvas/library reuse concentrates development on architecture semantics and agent tooling.

### Costs and boundaries

- JSON Schema cannot validate all graph references; semantic validation remains necessary.
- A flexible kind/view model is not automatically strict C4 compatibility.
- Snapshot storage and in-process queues are not a hosted database/concurrency design.
- Loopback/Origin checks are not authentication or authorization.
- Provider credentials are local plain text; external inference discloses architecture context.
- SVG/Mermaid exports lose model semantics/history and are not round-trip formats.

## Alternatives considered

- **Image/free-form drawing as source:** rejected for agent addressing, validation, and safe semantic edits.
- **Build the canvas from scratch:** rejected because interaction mechanics are mature reusable infrastructure.
- **Adopt a C4 DSL as the only canonical format:** deferred; attractive for documentation/interchange, but would constrain this custom visual MVP and require carefully designed editing/round-trip mappings.
- **Start with multi-user hosted persistence:** deferred to avoid pretending incomplete access control and operations are production-ready.

## Revisit when

Public hosting, collaboration, strict C4 interchange, discovery, deployment execution, encrypted provider storage, or large-model performance requirements become agreed product milestones. See [the roadmap](../roadmap.md) and [security policy](../../SECURITY.md).
