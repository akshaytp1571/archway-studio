import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createApplication } from '../server/app'
import type { Project } from '../shared/model'
async function fixture(run: (base: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'archway-milestone-api-'))
  const { app } = await createApplication(directory)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('archway-milestone-api-'))
    await rm(directory, { recursive: true, force: true })
  }
}
const request = async (base: string, url: string, body?: unknown) => {
  const response = await fetch(base + url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

test('REST and MCP view edits preserve IDs/layout and reject stale and invalid atomic batches', async () =>
  fixture(async (base) => {
    const path = '/api/projects/commerce-platform',
      original = (await request(base, path)).body
    const change = {
      baseRevision: 0,
      operations: [{ op: 'update_view', id: 'overview', patch: { name: 'REST view' } }],
    }
    const preview = await request(base, path + '/changes/preview', change)
    assert.equal(preview.status, 200)
    assert.deepEqual((await request(base, path)).body, original)
    const saved = await request(base, path + '/changes', change)
    assert.equal(saved.body.project.views[0].id, 'overview')
    assert.deepEqual(saved.body.project.views[0].layout, original.project.views[0].layout)
    assert.equal((await request(base, path + '/changes', change)).status, 409)
    const client = new Client({ name: 'milestone-tests', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(base + '/mcp'))
    try {
      await client.connect(transport)
      const result = await client.callTool({
        name: 'apply_changes',
        arguments: {
          projectId: 'commerce-platform',
          request: {
            baseRevision: 1,
            operations: [{ op: 'update_view', id: 'overview', patch: { description: 'MCP view' } }],
          },
        },
      })
      assert.notEqual(result.isError, true)
    } finally {
      await client.close()
    }
    const state = (await request(base, path)).body
    assert.equal(state.project.views[0].description, 'MCP view')
    assert.deepEqual(state.project.views[0].layout, original.project.views[0].layout)
    const invalid = await request(base, path + '/changes', {
      baseRevision: 2,
      operations: [
        { op: 'update_view', id: 'overview', patch: { name: 'Never saved' } },
        { op: 'update_view', id: 'missing', patch: { name: 'Invalid' } },
      ],
    })
    assert.equal(invalid.status, 404)
    assert.deepEqual((await request(base, path)).body, state)
  }))
test('snapshot REST capture is read-only and restore is atomic undoable and identity-preserving', async () =>
  fixture(async (base) => {
    const path = '/api/projects/commerce-platform',
      before = (await request(base, path)).body
    const created = await request(base, path + '/snapshots', {
      name: 'Before changes',
      baseRevision: 0,
    })
    assert.equal(created.status, 201)
    const id = created.body.snapshot.id
    assert.deepEqual((await request(base, path)).body, before)
    await request(base, path + '/changes', {
      baseRevision: 0,
      operations: [{ op: 'update_project', patch: { name: 'Modified' } }],
    })
    assert.equal(
      (await request(base, path + `/snapshots/${id}/restore`, { baseRevision: 0 })).status,
      409,
    )
    const preview = await request(base, path + `/snapshots/${id}/preview`, { baseRevision: 1 })
    assert.equal(preview.body.project.name, before.project.name)
    assert.equal((await request(base, path)).body.project.revision, 1)
    const restored = await request(base, path + `/snapshots/${id}/restore`, { baseRevision: 1 })
    assert.equal(restored.body.project.revision, 2)
    assert.equal(restored.body.project.id, before.project.id)
    assert.equal(restored.body.canUndo, true)
    const exported = await request(base, path + `/snapshots/${id}/export`)
    const imported = await request(base, '/api/projects', { import: exported.body })
    assert.equal(imported.status, 201)
    assert.notEqual(imported.body.project.id, before.project.id)
    assert.deepEqual(imported.body.project.components, before.project.components)
  }))
test('inventory REST preview is read-only and explicit apply uses the reviewed revision', async () =>
  fixture(async (base) => {
    const path = '/api/projects/commerce-platform',
      before = (await request(base, path)).body
    const inventory = {
      inventoryVersion: 1,
      components: [{ id: 'inventory-api', kind: 'service', name: 'Local inventory service' }],
    }
    const preview = await request(base, path + '/inventory/preview', { baseRevision: 0, inventory })
    assert.equal(preview.status, 200)
    assert.equal(preview.body.mode, 'inventory')
    assert.deepEqual((await request(base, path)).body, before)
    const applied = await request(base, path + '/changes', {
      baseRevision: preview.body.baseRevision,
      operations: preview.body.operations,
      source: 'import',
    })
    assert.equal(applied.body.project.revision, 1)
    assert.ok(
      (applied.body.project as Project).components.some(
        (component) => component.id === 'inventory-api',
      ),
    )
    assert.equal(
      (await request(base, path + '/inventory/preview', { baseRevision: 0, inventory })).status,
      409,
    )
    const noop = await request(base, path + '/inventory/preview', { baseRevision: 1, inventory })
    assert.equal(noop.body.operations.length, 0)
    assert.equal((await request(base, path)).body.project.revision, 1)
  }))
