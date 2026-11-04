# Roadmap, limitations, and non-goals

This document distinguishes implemented behavior from proposed work. See [the changelog](../CHANGELOG.md) for shipped changes.

## Current limitations

- Local, single-user operation; no authentication, project permissions, hosted-service boundary, or enforced agent delegation policy.
- Plain local provider settings, not encrypted secrets storage.
- One writer process per data directory; no database/distributed concurrency coordination.
- Snapshot-based undo/history has storage costs for larger models.
- Kind-filtered views, not a complete formal C4 hierarchy or interchange implementation.
- Boundary membership is model data, not runtime network/security enforcement. Creating/editing all boundary/view semantics is not exposed through a complete visual configuration UI.
- SVG/Mermaid are view exports, not full round-trip models. Current export routing is left-to-right oriented.
- No source-code/cloud discovery, infrastructure deployment execution, live runtime telemetry, pricing/cost engine, or automated best-practice certification.
- A configured provider is not a tested connection. Schema-valid model output is not necessarily a good design.
- No public/open-source license has been selected; the initial repository is private.
- A CI template is included but requires explicit workflow permission/activation before GitHub-hosted checks can run.

## Suggested sequence

### 1. Hosted-service safety before remote access

Design authentication, project permissions, agent operation scopes, encrypted credentials, SSRF/network policy, rate limits, session/CSRF controls, durable transactions, backups/migrations, and safe audit records. Do not start by removing loopback/Origin protections.

### 2. Stronger model/view editing

Add explicit view editing, boundary editing, richer semantic constraints, consistent directional export routing, schema-version migration fixtures, and large-model performance measurements. Keep one canonical model and stable IDs.

### 3. Collaboration

Introduce a persistence/concurrency design suitable for multiple users/processes, intentional conflict resolution, presence/sharing, and permission-aware history. Preserve the distinction between model semantics and local UI preferences.

### 4. Discovery and interoperability

Explore code/cloud inventory import, strict C4/Structurizr/LikeC4 adapters, and documented mapping/round-trip limits. Discovery should produce reviewable proposals, not silently overwrite the saved architecture.

### 5. Evidence-backed architecture assistance

Add rule packs, policy checks, measured operational context, and explainable suggestions. Clearly distinguish estimated/observed data from model-generated speculation. Do not invent health or cost signals.

## Non-goals for the current MVP

The current version does not deploy infrastructure or execute arbitrary agent-generated code. It is not a general-purpose whiteboard, a secrets vault, a live observability platform, or a production architecture approval authority.

Before taking a roadmap item, agree on acceptance criteria and follow [contributing](../CONTRIBUTING.md) and [the design decision](decisions/0001-model-first-local-first.md).
