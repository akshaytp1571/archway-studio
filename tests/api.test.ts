import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, request, type Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createApplication } from '../server/app'

let directory: string, server: Server, base: string
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'archway-api-test-'))
  const { app } = await createApplication(directory)
  server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })
  assert.equal(path.dirname(directory), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('archway-api-test-'))
  await rm(directory, { recursive: true, force: true })
})
const json = async (url: string, method = 'GET', body?: unknown) => {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: (await response.json()) as any }
}
const current = async () => (await json('/api/projects/commerce-platform')).body.project

test('health, projects, and machine-readable schemas are available', async () => {
  assert.equal((await json('/api/health')).body.status, 'ok')
  assert.equal((await json('/api/projects')).body.projects.length, 1)
  assert.ok((await json('/api/schema')).body.changes.properties.operations)
})
test('preview does not persist; apply persists and advances exactly one revision', async () => {
  const before = await current(),
    request = {
      baseRevision: before.revision,
      operations: [{ op: 'update_project', patch: { name: 'Previewed platform' } }],
    }
  const preview = await json('/api/projects/commerce-platform/changes/preview', 'POST', request)
  assert.equal(preview.status, 200)
  assert.equal(preview.body.project.name, 'Previewed platform')
  assert.equal((await current()).name, before.name)
  const applied = await json('/api/projects/commerce-platform/changes', 'POST', request)
  assert.equal(applied.status, 200)
  assert.equal(applied.body.project.revision, before.revision + 1)
  assert.equal((await current()).name, 'Previewed platform')
})
test('stale transactions return 409 without modifying the model', async () => {
  const before = await current(),
    response = await json('/api/projects/commerce-platform/changes', 'POST', {
      baseRevision: before.revision - 1,
      operations: [{ op: 'update_project', patch: { name: 'Stale write' } }],
    })
  assert.equal(response.status, 409)
  assert.equal(response.body.code, 'REVISION_CONFLICT')
  assert.equal((await current()).name, before.name)
})
test('invalid semantic batches return 422 and leave the saved revision unchanged', async () => {
  const before = await current(),
    response = await json('/api/projects/commerce-platform/changes', 'POST', {
      baseRevision: before.revision,
      operations: [
        {
          op: 'add_relationship',
          relationship: { id: 'bad-link', source: 'ghost', target: 'order-service' },
        },
      ],
    })
  assert.equal(response.status, 422)
  assert.equal((await current()).revision, before.revision)
})
test('concurrent writers at the same revision cannot both succeed', async () => {
  const before = await current(),
    request = (name: string) =>
      json('/api/projects/commerce-platform/changes', 'POST', {
        baseRevision: before.revision,
        operations: [{ op: 'update_project', patch: { name } }],
      })
  const results = await Promise.all([request('Writer one'), request('Writer two')])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  assert.equal((await current()).revision, before.revision + 1)
})
test('undo and redo restore content while revisions remain monotonic', async () => {
  const before = await current()
  await json('/api/projects/commerce-platform/changes', 'POST', {
    baseRevision: before.revision,
    operations: [{ op: 'update_project', patch: { name: 'Undo this' } }],
  })
  let project = await current()
  const undo = await json('/api/projects/commerce-platform/history', 'POST', {
    baseRevision: project.revision,
    action: 'undo',
  })
  assert.equal(undo.body.project.name, before.name)
  assert.equal(undo.body.project.revision, project.revision + 1)
  project = await current()
  const redo = await json('/api/projects/commerce-platform/history', 'POST', {
    baseRevision: project.revision,
    action: 'redo',
  })
  assert.equal(redo.body.project.name, 'Undo this')
  assert.equal(redo.body.project.revision, project.revision + 1)
})
test('exports contain the canonical model, SVG, and Mermaid text', async () => {
  for (const format of ['json', 'svg', 'mermaid']) {
    const response = await fetch(`${base}/api/projects/commerce-platform/export?format=${format}`)
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('content-disposition')?.includes('attachment'))
    const text = await response.text()
    assert.ok(
      format === 'json'
        ? JSON.parse(text).schemaVersion === 1
        : text.includes(format === 'svg' ? '<svg' : 'flowchart LR'),
    )
  }
})
test('provider keys are never returned to the browser and recipes need no provider', async () => {
  const saved = await json('/api/settings/provider', 'PUT', {
    baseUrl: 'http://127.0.0.1:9999/v1',
    model: 'test-model',
    apiKey: 'TEST-SECRET-DO-NOT-EXPOSE',
    enabled: false,
  })
  assert.equal(JSON.stringify(saved.body).includes('TEST-SECRET'), false)
  assert.equal(saved.body.hasApiKey, true)
  const project = await current(),
    recipe = await json('/api/assistant/plan', 'POST', {
      projectId: project.id,
      baseRevision: project.revision,
      recipeId: 'cache',
    })
  assert.equal(recipe.status, 200)
  assert.equal(recipe.body.mode, 'recipe')
  assert.equal((await current()).revision, project.revision)
  const prompt = await json('/api/assistant/plan', 'POST', {
    projectId: project.id,
    baseRevision: project.revision,
    prompt: 'Add a cache',
  })
  assert.equal(prompt.body.code, 'PROVIDER_NOT_CONFIGURED')
})
test('cross-origin and hostile Host headers are rejected', async () => {
  assert.equal(
    (await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } })).status,
    403,
  )
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(`${base}/api/health`, { headers: { Host: 'evil.example' } }, (response) => {
      response.resume()
      resolve(response.statusCode!)
    })
    req.on('error', reject)
    req.end()
  })
  assert.equal(status, 403)
})
test('MCP handshake, tool discovery, model reads, previews, and writes work through the SDK', async () => {
  const client = new Client({ name: 'archway-test-agent', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))
  try {
    const tools = await client.listTools()
    assert.equal(tools.tools.length, 6)
    const read = await client.callTool({
      name: 'get_architecture',
      arguments: { projectId: 'commerce-platform' },
    })
    const data = JSON.parse((read.content as { text: string }[])[0].text)
    const request = {
      baseRevision: data.project.revision,
      operations: [{ op: 'update_project', patch: { description: 'Updated by an MCP agent' } }],
    }
    const preview = await client.callTool({
      name: 'preview_changes',
      arguments: { projectId: 'commerce-platform', request },
    })
    assert.notEqual(preview.isError, true)
    assert.notEqual((await current()).description, 'Updated by an MCP agent')
    const write = await client.callTool({
      name: 'apply_changes',
      arguments: { projectId: 'commerce-platform', request },
    })
    assert.notEqual(write.isError, true)
    assert.equal((await current()).description, 'Updated by an MCP agent')
  } finally {
    await client.close()
  }
})
