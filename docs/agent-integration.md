# Agent integration and safe editing workflows

This guide is for an agent operating Archway through REST or MCP. For an agent changing repository code, begin with [AGENTS.md](../AGENTS.md).

## First principles

1. Discover projects; select the project the user actually intended.
2. Read the model and current revision.
3. Inspect relevant components, relationships, boundaries, and impact.
4. Form a minimal semantic batch using stable IDs.
5. Preview the unchanged original batch and inspect validation/warnings.
6. Apply only when authorized by the user/host policy and still at that revision.
7. Confirm the saved model/revision and report the result.

Do not click canvas pixels to infer topology. Do not treat component names as IDs. Do not confuse boundary render nodes with components. Do not assume “Model valid” means a proposed design is operationally correct.

The current server is local-only and has no project authorization layer. Run agents on the same trusted machine; do not expose/tunnel the port to an untrusted network as a shortcut.

## REST example: add a cache

Run this as a Node.js module from the repository root. It assumes an unmodified, uniquely identifiable commerce template with `catalog-service` and boundary `data`. If there are multiple matches, select an explicit project ID instead of guessing.

The [sample batch](examples/add-cache.changes.json) is tested against the [synthetic sample project](examples/commerce.project.json). Always replace its revision with the one just read, only after verifying that the intended IDs and state still match.

```js
import { readFile } from 'node:fs/promises'

const base = 'http://127.0.0.1:4317'
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`${result.code}: ${result.message}`)
  return result
}

const { projects } = await request('/api/projects')
const candidates = projects.filter((project) => project.name === 'Commerce platform')
if (candidates.length !== 1) throw new Error('Select an explicit project ID.')
const id = encodeURIComponent(candidates[0].id)
const { project } = await request(`/api/projects/${id}`)
if (!project.components.some((component) => component.id === 'catalog-service')) {
  throw new Error('This example does not match the selected architecture.')
}
if (project.components.some((component) => component.id === 'catalog-cache')) {
  throw new Error('The proposed cache already exists; inspect it instead of duplicating it.')
}

const example = JSON.parse(await readFile('docs/examples/add-cache.changes.json', 'utf8'))
const batch = { ...example, baseRevision: project.revision }
const preview = await request(`/api/projects/${id}/changes/preview`, batch)
console.log(preview.validation, preview.operations)

// Stop for review/authorization as required by your host policy.
// Apply the ORIGINAL batch, not preview.operations (which are descriptions).
const saved = await request(`/api/projects/${id}/changes`, batch)
console.log({ revision: saved.project.revision, valid: saved.validation.valid })
```

The example is not a license for unattended destructive changes. It intentionally stops on errors rather than silently retrying at a newer revision. See [API errors](api.md#error-contracts).

## MCP example

Example configuration for a client that supports Streamable HTTP; exact syntax varies by client:

```json
{
  "mcpServers": {
    "archway": { "type": "http", "url": "http://127.0.0.1:4317/mcp" }
  }
}
```

Call `list_projects`, then `get_architecture` with the selected `projectId`. To preview and apply, pass a nested `request`:

```json
{
  "projectId": "the-project-id-you-read",
  "request": {
    "baseRevision": 3,
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
}
```

Replace example IDs/revision with verified model values. Send this argument object to `preview_changes`, inspect the JSON in `content[].text` and `isError`, then use the same argument object for `apply_changes` if authorized. The server forces MCP mutation source to `agent`.

`get_model_schema` returns machine-readable schemas. [Offline references](reference/README.md) are available without running a server, but graph-reference validation still requires the engine/API.

## Common tasks

| Intention                      | Safe operation/workflow                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Rename a service               | `update_component` with only `patch.name`; keep ID                                           |
| Add a component and connect it | `add_component`, then `add_relationship`, in one batch                                       |
| Move cards                     | `set_layout` for the intended view only                                                      |
| Add a tag or metadata entry    | Read current arrays/maps and send the complete intended new property; no implicit deep merge |
| Remove a component             | `analyze_impact`, preview `remove_component` with explicitly authorized `cascade: true`      |
| Remove a boundary              | First reassign/unassign its members, then remove it                                          |
| Explain dependencies           | `analyze_impact`; upstream/downstream are directed and include indirect paths                |
| Recover an accidental change   | Revision-checked history undo; history travel advances the revision                          |
| Import a model                 | `POST /api/projects` with canonical `import`; expect a fresh project ID/revision             |

Do not invent `update_view`, deployment, discovery, authentication, or cost-analysis endpoints. They are not implemented.

## Recovery rules

- **409 conflict:** re-read the architecture, compare what changed, re-evaluate user intent/impact, form a new batch if still appropriate, and preview again. Never just swap in `currentRevision` and retry an old intent.
- **Lost apply response:** success may already have occurred. Read model/history and verify the intended IDs/properties before retrying. Apply is not idempotent.
- **400 invalid input:** fix schema/JSON shape. Do not ask the model to invent unsupported operation names.
- **422 reference/semantic error:** read actual IDs and relationships; do not fabricate missing components without user intent.
- **Provider failure:** report it honestly or offer a specifically selected recipe. Do not pretend a recipe was model inference.
- **Warnings:** explain relevant advisory observations. Do not present them as measured production risk or health.

## Security and confidentiality

Avoid sending real architecture data to a provider unless the user has accepted that disclosure. Never expose keys, raw provider settings, or private models in logs, issues, commits, or screenshots. Tool annotations and history source labels are not authenticated permissions. Follow [the security policy](../SECURITY.md) and the host's approval rules.
