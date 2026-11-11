# Local inventory adapter

This is one bounded discovery adapter for an **explicit local JSON inventory**, not automatic code/cloud scanning. It cannot execute commands, access credentials, crawl a network, or fetch URLs.

Open **Project tools → Discover from local inventory**, select JSON, click **Preview inventory**, then **Review inventory proposal**. The shared assistant shows field-level changes and advisory warnings. **Apply** is a separate explicit action at the reviewed revision. Cancel/discard and no-op previews never save anything.

## Format

```json
{
  "inventoryVersion": 1,
  "components": [
    {
      "id": "inventory-service",
      "kind": "service",
      "name": "Imported service",
      "technology": "Rust"
    }
  ],
  "relationships": [],
  "boundaries": []
}
```

The [synthetic example](examples/local-inventory.json) is safe to preview on a blank project.

- Components require stable `id`, supported canonical `kind`, and `name`. Optional fields are description, technology, owner, tags, boundaryId, and string metadata.
- Relationships require id/source/target; optional label/protocol/interaction/description use canonical contracts.
- Boundaries require id/name; type/description are optional. Relationships and boundaries can be omitted.
- Unknown fields, duplicate IDs within a collection, invalid kinds, invalid/dangling references, and oversized input are rejected. General body limit: 5 MB; input limits: 500 components, 1,500 relationships, 100 boundaries.
- Existing IDs are case-sensitive matches. Only explicitly supplied changed fields become update operations; omitted fields and unrelated entities remain intact. New IDs become additions. No removal, replacement, layout, or executable operation is generated.
- At most 100 proposed operations per atomic preview. Split larger inventories into smaller valid inputs; the server does not truncate and silently apply a subset.
- Mapping order is deterministic: boundaries, components, relationships, stable ID ordering. The report counts added/updated/unchanged entities and explains preserved/unsupported mappings. `skipped` remains zero because invalid entities are rejected rather than quietly dropped.

## REST

`POST /api/projects/:id/inventory/preview` accepts `{baseRevision,inventory}` and returns `{summary,operations,report,mode:"inventory",proposedProject,validation,baseRevision}`. It uses the normal model engine and read-only preview. Apply the unchanged reviewed operations through the ordinary revision-checked change endpoint; a stale batch is rejected.

This inventory format is a narrow semantic input, not a lossless full-project round-trip format. Only canonical project JSON supports lossless import/export; no C4, cloud, code, or other inventory interchange fidelity is claimed.

See [API](api.md), [model](model.md), and [security](../SECURITY.md).
