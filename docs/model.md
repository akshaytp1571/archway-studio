# Model and operation reference

The source of truth is [the shared model engine](../shared/model.ts). The [project schema](reference/project.schema.json) describes canonical documents; the [change-request schema](reference/change-request.schema.json) describes accepted transaction input.

JSON Schema defaults are annotations, not automatic mutations. The server's Zod parsers fill supported defaults and then run semantic reference validation. A schema-conforming document can still contain invalid graph references.

## Project

A project has `schemaVersion: 1`, `id`, `revision`, ISO `createdAt`/`updatedAt`, `name`, `description`, and collections of `components`, `relationships`, `boundaries`, and `views`.

Revisions are non-negative integers managed by the server. Every saved batch or undo/redo advances a revision exactly once. Do not use timestamps as concurrency tokens. The project ID does not change when the project is renamed.

The [sample commerce document](examples/commerce.project.json) is generated from a synthetic template and contains no user data.

## Entities

| Entity       | Required identity/structure | Other properties and defaults                                                                                 |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Component    | `id`, `kind`, `name`        | `description`, `technology`, `owner` default to empty strings; `tags: []`; `boundaryId: null`; `metadata: {}` |
| Relationship | `id`, `source`, `target`    | `label`, `protocol`, `description` default to empty strings; `interaction: "sync"`                            |
| Boundary     | `id`, `name`                | `type: "system"`, `description: ""`                                                                           |
| View         | `id`, `name`, `layout`      | `description: ""`, `kinds: []`; layout direction `"LR"`, positions `{}`                                       |

Component kinds are `client`, `gateway`, `service`, `database`, `queue`, and `external`. A cache is represented as a database component with appropriate technology/tags; do not invent a `cache` kind.

Boundary types are `system`, `trust`, and `network`. Membership is expressed by `component.boundaryId`; it does not create an ACL, network policy, or deployment resource. Boundary geometry is derived from its visible members' positions.

Relationships are directed. `interaction` is `sync` or `async`; protocol/label strings are descriptive, not runtime protocol compatibility checks. Cycles and self-relationships are representable.

View `kinds: []` means all components. Non-empty kinds filter the shared component set. Coordinates live under `view.layout.positions[componentId]`; moving a card changes a view, not the component identity. There is no global active-view property or separate per-view component copy.

## IDs and validation

IDs are case-sensitive, 1–96 characters, start with an ASCII letter/number, and then permit letters, numbers, `_`, `.`, `:`, and `-`. No spaces or path separators. Use meaningful IDs and preserve them across renames.

Validation rejects:

- Duplicate IDs **within each collection**.
- A component referencing a missing boundary.
- Relationships with missing source or target components.
- A view position referencing a missing component.
- Removing the final view or removing an in-use boundary.
- Connected component removal without explicit cascade.

IDs are not required to be globally unique across different entity collections; avoid confusing cross-type reuse in human-facing designs nevertheless.

Advisory warnings cover isolated components, duplicate component names, and self-relationships. Duplicate names are allowed because IDs distinguish components. Cycles are allowed and impact traversal is cycle-safe. Validity does not certify uptime, security, scalability, cost, or every architecture best practice.

## Operations

A transaction has `baseRevision`, `operations`, optional `source` (defaults to `agent`), and optional `message` (defaults to empty). The batch is applied in order to a clone; the final graph must validate. Add a boundary/component before an operation that depends on its existence.

| `op`                  | Payload                                     | Behavior                                                                                        |
| --------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `add_component`       | `component`, optional `position`            | Add a unique component and initial positions to every view                                      |
| `update_component`    | `id`, `patch`                               | Replace only explicitly provided component properties                                           |
| `remove_component`    | `id`, optional `cascade`                    | `cascade` defaults false; true explicitly removes relationships and all view positions          |
| `add_relationship`    | `relationship`                              | Add a unique directed relationship                                                              |
| `update_relationship` | `id`, `patch`                               | Replace explicitly provided relationship properties                                             |
| `remove_relationship` | `id`                                        | Remove one existing relationship                                                                |
| `add_boundary`        | `boundary`                                  | Add a unique boundary                                                                           |
| `update_boundary`     | `id`, `patch`                               | Replace explicitly provided boundary properties                                                 |
| `remove_boundary`     | `id`                                        | Reject while any component belongs to it                                                        |
| `update_project`      | `patch`                                     | Update project name/description, not ID/revision/timestamps                                     |
| `set_layout`          | `viewId`, `positions`, optional `direction` | Merge coordinate entries into one view; unspecified positions/views remain unchanged            |
| `add_view`            | `view`                                      | Add a unique view with its filter/layout                                                        |
| `remove_view`         | `id`                                        | Remove a view only if at least one remains                                                      |
| `replace_content`     | `content`                                   | Replace name/description and all model collections, preserving project identity/server metadata |

There is currently no `update_view` operation. Do not invent one or invent REST/MCP endpoints that are not in the [API reference](api.md).

### Patch semantics

Omitted fields are unchanged. Supplied arrays/maps replace the whole property; they do not deep-merge automatically. To add a metadata entry or tag, read the current value and send the intended complete new map/array.

```json
{
  "op": "update_component",
  "id": "order-service",
  "patch": { "name": "Order orchestration" }
}
```

That rename must preserve technology, tags, metadata, description, owner, boundary, and every relationship ID/reference. This behavior has a regression test.

### Destructive and bulk edits

`remove_component` with `cascade: true` removes the component, incident relationships, and its coordinates from all views. Preview and inspect impact first.

`replace_content` is powerful and intended for controlled bulk changes/migrations/history-like workflows, not routine agent edits. The built-in provider planner prohibits `replace_content`, `remove_view`, and `set_layout`; external REST/MCP clients still have access to the low-level operations.

## Limits

| Item                                            | Limit                                                         |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Components / relationships / boundaries / views | 500 / 1,500 / 100 / 1–30                                      |
| Operations per general transaction              | 1–100                                                         |
| Operations per provider plan                    | 1–50                                                          |
| Stable ID length                                | 1–96 characters                                               |
| Entity/project names                            | 1–100 characters                                              |
| Project/component description                   | 2,000 characters                                              |
| Boundary/relationship/view description          | 1,000 characters                                              |
| Component tags                                  | Up to 20 tags, each 1–40 characters after trimming            |
| Component metadata                              | String keys up to 80 and string values up to 1,000 characters |
| Coordinate values                               | Finite numbers from −20,000 to 20,000                         |
| Request message / free-form prompt              | 240 / 6,000 characters                                        |
| HTTP JSON body / provider timeout               | 5 MB / 60 seconds                                             |

Size limits prevent some invalid inputs; they are not a promise of unlimited rendering performance or protection against all denial-of-service risks.

## Exports and evolution

Canonical JSON is the lossless model format. Import creates an independent project with a fresh project ID/revision and preserves internal entity IDs. SVG and Mermaid contain a view rendering, not full model semantics or history. Current export routing is left-to-right oriented; do not claim full vertical-layout or C4 interchange fidelity.

Persisted documents and undo snapshots are version-sensitive. A schema-version change needs a migration strategy, old-document fixtures, import/storage tests, and regenerated references. Do not simply change `schemaVersion` and assume existing user projects will load.
