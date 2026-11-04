import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { z } from 'zod'
import {
  ChangeRequestSchema,
  ProjectSchema,
  applyOperations,
  validateArchitecture,
} from '../shared/model'
import { createApplication } from '../server/app'

const root = fileURLToPath(new URL('../', import.meta.url))
async function document(relativePath: string) {
  return JSON.parse((await readFile(path.join(root, relativePath), 'utf8')).replace(/^\uFEFF/, ''))
}

test('the documented commerce project is a valid synthetic canonical model', async () => {
  const project = ProjectSchema.parse(await document('docs/examples/commerce.project.json'))
  assert.equal(project.id, 'example-commerce')
  assert.equal(project.revision, 0)
  assert.equal(validateArchitecture(project).valid, true)
})

test('the documented cache batch is valid, atomic, and preserves the original model', async () => {
  const project = ProjectSchema.parse(await document('docs/examples/commerce.project.json'))
  const original = structuredClone(project)
  const request = ChangeRequestSchema.parse(await document('docs/examples/add-cache.changes.json'))
  const after = applyOperations(project, request.operations)
  assert.equal(validateArchitecture(after).valid, true)
  assert.equal(after.components.length, project.components.length + 1)
  assert.equal(after.relationships.length, project.relationships.length + 1)
  assert.equal(after.components.find((c) => c.id === 'catalog-cache')?.metadata.ttlSeconds, '60')
  assert.deepEqual(project, original)
})

test('the documented minimal rename preserves omitted properties and stable IDs', async () => {
  const project = ProjectSchema.parse(await document('docs/examples/commerce.project.json'))
  const component = project.components.find((c) => c.id === 'order-service')!
  const request = ChangeRequestSchema.parse({
    baseRevision: 0,
    operations: [
      { op: 'update_component', id: component.id, patch: { name: 'Order orchestration' } },
    ],
  })
  const after = applyOperations(project, request.operations).components.find(
    (c) => c.id === component.id,
  )!
  assert.deepEqual(after, { ...component, name: 'Order orchestration' })
})

test('generated schemas match source and describe defaults as optional change input', async () => {
  const project = await document('docs/reference/project.schema.json')
  const changes = await document('docs/reference/change-request.schema.json')
  assert.deepEqual(project, z.toJSONSchema(ProjectSchema))
  assert.deepEqual(changes, z.toJSONSchema(ChangeRequestSchema, { io: 'input' }))
  assert.ok(changes.required, 'The change schema must declare required transaction fields')
  assert.equal(changes.required.includes('source'), false)
  assert.equal(changes.required.includes('message'), false)
})

test('schema-valid references still require semantic model validation', async () => {
  const project = ProjectSchema.parse(await document('docs/examples/commerce.project.json'))
  const request = ChangeRequestSchema.parse({
    baseRevision: 0,
    operations: [
      {
        op: 'add_relationship',
        relationship: {
          id: 'missing-reference',
          source: 'catalog-service',
          target: 'not-in-this-project',
        },
      },
    ],
  })
  assert.throws(() => applyOperations(project, request.operations), /invalid references/)
})

test('the HTTP schema endpoint matches the checked-in machine-readable references', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'archway-doc-test-'))
  const { app } = await createApplication(directory)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = (server.address() as { port: number }).port
    const response = await fetch(`http://127.0.0.1:${port}/api/schema`)
    assert.equal(response.status, 200)
    const schemas = await response.json()
    assert.deepEqual(schemas.project, await document('docs/reference/project.schema.json'))
    assert.deepEqual(schemas.changes, await document('docs/reference/change-request.schema.json'))
  } finally {
    await new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('archway-doc-test-'))
    await rm(directory, { recursive: true, force: true })
  }
})
