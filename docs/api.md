# REST and MCP API reference

Default base URL: `http://127.0.0.1:4317`. Requests are local-only and unauthenticated; see [security](../SECURITY.md). Send JSON bodies with `Content-Type: application/json`. IDs should be URL-encoded in path segments.

The contract lives in [the HTTP application](../server/app.ts), [shared schemas](../shared/model.ts), and [MCP adapter](../server/mcp.ts). Generated [project](reference/project.schema.json) and [change-request](reference/change-request.schema.json) schemas are checked against the HTTP schema endpoint.

## Project state response

Reads, creation, successful apply, and history travel return:

```json
{
  "project": { "schemaVersion": 1, "id": "...", "revision": 1 },
  "validation": { "valid": true, "errors": [], "warnings": [] },
  "history": [],
  "canUndo": true,
  "canRedo": false
}
```

The abbreviated `project` above stands for a complete canonical project. History is newest first, capped at 80 returned events. The raw storage wrapper and undo snapshots are not part of this response.

## Endpoints

| Method and path                             | Request / response                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`                           | `{status, version, agentReady, aiConfigured, projectCount}`; configuration is not a provider-connectivity test                                   |
| `GET /api/schema`                           | `{project, changes}` JSON schemas; project is canonical output, changes describe accepted input                                                  |
| `GET /api/projects`                         | `{projects: [...]}` summaries with IDs, names, revisions, timestamps, component/relationship counts                                              |
| `POST /api/projects`                        | `{template?, name?, import?}`; template is `commerce`, `saas`, or `blank` (default); import is a complete project; returns 201 and project state |
| `GET /api/projects/:id`                     | Project state response                                                                                                                           |
| `GET /api/projects/:id/context`             | `{project, validation, capabilities, changeEndpoint, previewEndpoint, mcpEndpoint}`                                                              |
| `POST /api/projects/:id/changes/preview`    | A change request; validates without saving                                                                                                       |
| `POST /api/projects/:id/changes`            | The same change request; saves one atomic revision                                                                                               |
| `POST /api/projects/:id/history`            | `{baseRevision, action: "undo"                                                                                                                   | "redo"}`; returns restored content at a new revision |
| `GET /api/projects/:id/impact/:componentId` | `{component, upstream, downstream, directRelationships, affectedViews}`                                                                          |
| `GET /api/projects/:id/events`              | Server-sent events for saved revisions                                                                                                           |
| `GET /api/projects/:id/export`              | Query `format=json                                                                                                                               | svg                                                  | mermaid`, optional `viewId`; downloadable JSON/SVG/MMD |
| `GET /api/settings/provider`                | `{baseUrl, model, configured, hasApiKey, source}`; never returns the key                                                                         |
| `PUT /api/settings/provider`                | `{baseUrl, model, apiKey?, enabled?, reuseApiKey?}`; enabled defaults true; key reuse rules below                                                |
| `POST /api/assistant/plan`                  | `{projectId, baseRevision, prompt? OR recipeId?}`; exactly one prompt/recipe                                                                     |
| `POST /mcp`                                 | Stateless Streamable HTTP MCP transport                                                                                                          |

There is no project deletion endpoint, authentication endpoint, deployment endpoint, or GraphQL API. `update_view` is an operation on the existing transaction/MCP change paths, not a separate endpoint. Do not infer routes from UI labels or other diagram tools.

Import creates a fresh project ID, revision zero, and new timestamps while preserving internal component/relationship/boundary/view IDs. An API import retains the imported name unless `name` is supplied; the GUI chooses an `(imported)` name explicitly.

## Transaction request

```json
{
  "baseRevision": 0,
  "source": "agent",
  "message": "Rename the order service",
  "operations": [
    {
      "op": "update_component",
      "id": "order-service",
      "patch": { "name": "Order orchestration" }
    }
  ]
}
```

Use the actual current revision, not the example's literal zero. `source` defaults to `agent`, `message` to empty; `source` is an audit label, not an authenticated identity. There are 1–100 operations per transaction. See [operation semantics and limits](model.md).

Preview returns:

```json
{
  "project": { "id": "...", "revision": 0 },
  "validation": { "valid": true, "errors": [], "warnings": [] },
  "operations": ["Update order-service"],
  "baseRevision": 0
}
```

Again, `project` is abbreviated here. **Preview response `operations` contains human-readable descriptions, not operation objects. Preserve the original request for apply.** A preview's project revision stays unchanged; it does not reserve a revision or save anything.

Apply rechecks the current revision, validates the entire batch, and advances it once. A timeout/lost response does not prove the write failed; read the model/history before retrying. Apply is not an idempotent API.

## Assistant plans

Recipe IDs are `notifications`, `cache`, and `observability`. Recipes require a suitable service in the model and never call an LLM.

A free-form prompt is 3–6,000 characters and needs a configured OpenAI-compatible provider. Provider plans contain 1–50 operations and prohibit `replace_content`, `remove_view`, and `set_layout`.

A successful plan returns `summary`, raw `operations`, `mode` (`recipe` or `provider`), optional provider `model`, `proposedProject`, `validation`, and `baseRevision`. This differs from the general preview response: plan `operations` are actual operation objects. A plan is never automatically persisted.

Settings do not prove connectivity. Planning checks the revision before and after inference/recipe creation. A provider response can be JSON-valid but fail schema/reference validation; no changes are applied in that case.

Provider settings saves use `apiKey` whenever it is present, including an empty string to clear the key. If omitted, a saved key is preserved automatically only when the prior source is saved settings and the normalized base URL is unchanged. Environment-sourced keys and keys associated with changed endpoints require explicit `reuseApiKey: true` consent; otherwise the save fails before writing. The consent flag is not persisted, and responses never include a secret. Fresh keyless settings are valid.

## Local reliability, recovery, and inventory endpoints

| Method/path                                            | Contract                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/settings/provider/test`                     | Empty object; tests saved provider via synthetic chat exchange; `{ok,model,latencyMs,checkedAt}`; no architecture/credential response |
| `GET /api/projects/:id/snapshots`                      | Lists named snapshot summaries                                                                                                        |
| `POST /api/projects/:id/snapshots`                     | `{name,baseRevision}` → 201 `{snapshot}`; capture changes no project revision/history                                                 |
| `GET /api/projects/:id/snapshots/:snapshotId`          | Validated snapshot record                                                                                                             |
| `GET /api/projects/:id/snapshots/:snapshotId/export`   | Downloadable canonical Project JSON, independent-import compatible                                                                    |
| `POST /api/projects/:id/snapshots/:snapshotId/preview` | `{baseRevision}`; read-only whole-content restore preview                                                                             |
| `POST /api/projects/:id/snapshots/:snapshotId/restore` | `{baseRevision}`; atomic content restore, new monotonic revision/undo/history/live event                                              |
| `POST /api/projects/:id/inventory/preview`             | `{baseRevision,inventory}` → `{summary,operations,report,mode:"inventory",proposedProject,validation,baseRevision}`; no writes        |

Provider planning and saved-connection testing support cancellation on client disconnect. Timeout covers response-body reading and remains bounded at 60 seconds; cancellation maps to `PROVIDER_CANCELLED` (499), not timeout. The connection test makes a real tiny inference request and may incur charges, but sends no architecture. It reports success only after the required JSON response succeeds.

Snapshot format version 1 validates canonical version 1 and references, rejects unsupported/corrupt data, and caps captures at 20 without automatic deletion. Restore preserves the current project identity, applies via the same engine, and rejects stale edits. See [snapshot contracts](snapshots.md).

Inventory previews only add/update stable-ID semantics, preserve omitted properties and unrelated entities, and cap operations at 100. Apply the exact reviewed batch through the existing change route; no separate automatic apply or executable discovery exists. See [inventory mapping](inventory.md). Proposal warnings remain advisory.

## Error contracts

REST errors generally have `{code, message, issues?}`. A revision conflict also includes `currentRevision`, not the complete current project.

| HTTP | Representative code                                                                  | Recovery                                                                              |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 400  | `SCHEMA_INVALID`, `INVALID_JSON`                                                     | Fix the request shape/JSON; do not retry unchanged                                    |
| 400  | `PROVIDER_KEY_CONFIRMATION_REQUIRED`                                                 | Provide `apiKey` or `reuseApiKey: true`; no settings are written                      |
| 400  | `PROVIDER_NOT_CONFIGURED`                                                            | Configure a provider or use an explicit recipe                                        |
| 400  | `NOTHING_TO_UNDO`                                                                    | No applicable undo/redo snapshot exists                                               |
| 403  | `HOST_DENIED`, `ORIGIN_DENIED`                                                       | Use the documented loopback/same-origin setup; do not bypass checks                   |
| 404  | `NOT_FOUND`                                                                          | Re-read project/entity IDs; do not invent replacements                                |
| 409  | `REVISION_CONFLICT`                                                                  | Re-read, re-evaluate intention/impact, re-preview; never blindly change the revision  |
| 413  | `BODY_TOO_LARGE`                                                                     | Stay below the 5 MB body limit                                                        |
| 422  | `MODEL_INVALID`, `DUPLICATE_ID`, `HAS_RELATIONSHIPS`, `BOUNDARY_IN_USE`, `LAST_VIEW` | Correct semantic references or explicitly authorize the intended destructive behavior |
| 422  | `RECIPE_UNAVAILABLE`, `PLAN_INVALID`, `PLAN_TOO_BROAD`                               | Use an appropriate model or smaller/specific request; nothing was saved               |
| 502  | Provider/network/response errors                                                     | Check provider configuration/connectivity and compatibility                           |
| 504  | `PROVIDER_TIMEOUT`                                                                   | Provider exceeded the 60-second request timeout                                       |
| 500  | `INTERNAL_ERROR`                                                                     | Inspect sanitized server logs; do not expose secrets                                  |

Warnings do not block saves. They are advisory graph observations, not production-health signals.

## Live events

An SSE connection first receives `event: ready` with `{}`. Saved changes produce:

```text
event: change
data: {"projectId":"example-commerce","revision":3}
```

Comment heartbeats are sent every 15 seconds. Re-read the model when a newer revision arrives; the event is not a full model delta. Disconnecting removes the event listener.

## MCP transport and tools

Use a client supporting Streamable HTTP. The official SDK handles initialize/protocol negotiation and the required JSON/event-stream Accept headers. This endpoint is stateless: no session ID is created. Ordinary browser `GET /mcp` and DELETE requests return 405; that is not a failed MCP handshake.

| Tool               | Arguments                  | Behavior                                                                 |
| ------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `list_projects`    | `{}`                       | Project summaries                                                        |
| `get_architecture` | `{projectId}`              | Project state response                                                   |
| `get_model_schema` | `{}`                       | Project and change-input schemas                                         |
| `preview_changes`  | `{projectId, request}`     | Read-only preview; nested request is a change request                    |
| `apply_changes`    | `{projectId, request}`     | Atomic, non-idempotent mutation; nested request is a change request      |
| `analyze_impact`   | `{projectId, componentId}` | Directed upstream/downstream reachability, relationships, affected views |

Both change tools record source `agent` regardless of the request label. Tool results currently contain JSON serialized into `content[].text`; they do not promise `structuredContent`. Check `isError` and parse the JSON error code. A transport-level HTTP success is not sufficient to conclude that a tool mutation succeeded.

Read-only/destructive/idempotency annotations help clients describe tools; they are not a substitute for authorization. See the [integration examples](agent-integration.md) and [security policy](../SECURITY.md).
