# Named snapshots and local recovery

Use **Project tools → Snapshots and backups** to capture a named copy of the saved canonical project. A capture checks the current revision but does not advance revision, append history, or change undo/redo.

- Maximum 20 snapshots per project. The limit rejects new captures; no automatic deletion occurs. This increment has no snapshot deletion UI/API.
- Records live separately from project documents under the configured data directory. They contain a canonical project, identity, name, timestamp, and source revision—not provider settings or credentials.
- **Preview restore** constructs a read-only replacement of all project content. Review the counts and authorize the replacement explicitly.
- **Restore reviewed snapshot** checks the reviewed revision and applies one atomic transaction. It preserves the current project ID/creation time and internal entity IDs, advances the revision once, creates history/undo, and emits normal live-change events.
- Stale, malformed, unsupported-version, or invalid-reference restores do not save anything. Keep damaged files for deliberate recovery; do not edit live storage while the app writes it.

## Portable backup

**Download canonical JSON** exports the snapshot's project only. **Import backup as a separate project** uses normal lossless JSON import, creates a new project ID/revision zero, and retains internal entity IDs. It never overwrites the active project. Protect architecture backups as confidential data.

## REST contract

All paths start with `/api/projects/:id/snapshots`:

| Method/path                 | Input/result                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| GET `/`                     | `{snapshots:[{id,name,createdAt,revision}]}`                      |
| POST `/`                    | `{name,baseRevision}` → 201 `{snapshot}`; read-only capture       |
| GET `/:snapshotId`          | Versioned snapshot record                                         |
| GET `/:snapshotId/export`   | Downloadable canonical Project JSON                               |
| POST `/:snapshotId/preview` | `{baseRevision}` → proposed project/validation/snapshot; no write |
| POST `/:snapshotId/restore` | `{baseRevision}` → normal saved project state at a new revision   |

## Versioning and migration boundary

Snapshot format `snapshotVersion: 1` embeds canonical `schemaVersion: 1`. Existing project storage wrappers remain unchanged and readable. Version, container identity, source revision, schema, and semantic references are validated before use. Future versions are rejected with actionable errors; there is no invented migration from an unsupported version. A future migration must add explicit tested old-document fixtures, import/storage tests, atomic recovery behavior, and synchronized references before changing versions.

See [API](api.md), [model](model.md), [configuration](configuration.md), and [security](../SECURITY.md).
