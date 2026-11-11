import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { ModelError } from '../shared/model'
import { ProjectStore } from '../server/store'
import { mountSnapshotRoutes } from '../server/snapshot-routes'

const projectId = 'snapshot-project'
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'archway-snapshot-test-'))
  const store = new ProjectStore(directory)
  await store.initialize(false)
  const state = await store.create('commerce', 'Snapshot fixture', projectId)
  return { directory, store, project: state.project }
}
async function cleanup(directory: string) {
  assert.equal(path.dirname(directory), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith('archway-snapshot-test-'))
  await rm(directory, { recursive: true, force: true })
}

let directory: string,
  store: ProjectStore,
  initialProject: Awaited<ReturnType<ProjectStore['get']>>['project']
beforeEach(async () => {
  const value = await fixture()
  directory = value.directory
  store = value.store
  initialProject = value.project
})
afterEach(async () => cleanup(directory))

test('creating a snapshot captures canonical state without changing project revision, history, or undo', async () => {
  const beforeState = await store.get(projectId)
  const created = await store.createSnapshot(
    projectId,
    '  Before work  ',
    beforeState.project.revision,
  )
  const afterState = await store.get(projectId)
  const snapshot = await store.getSnapshot(projectId, created.id)
  assert.equal(created.name, 'Before work')
  assert.equal(created.revision, beforeState.project.revision)
  assert.deepEqual(afterState, beforeState)
  assert.equal(snapshot.project.id, beforeState.project.id)
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'createdAt',
    'id',
    'name',
    'project',
    'projectId',
    'snapshotVersion',
    'sourceRevision',
  ])
})

test('snapshot count is bounded at twenty and new snapshots are refused instead of deleting old ones', async () => {
  for (let count = 0; count < 20; count++)
    await store.createSnapshot(projectId, `Snapshot ${count + 1}`, initialProject.revision)
  const existing = await store.listSnapshots(projectId)
  assert.equal(existing.length, 20)
  await assert.rejects(
    store.createSnapshot(projectId, 'One too many', initialProject.revision),
    (error: unknown) => error instanceof ModelError && error.code === 'SNAPSHOT_LIMIT',
  )
  assert.deepEqual(await store.listSnapshots(projectId), existing)
})

test('restore uses a new human revision, preserves project identity/creation time/entity IDs, and is undoable', async () => {
  const saved = await store.get(projectId)
  const componentIds = saved.project.components.map((component) => component.id)
  const relationshipIds = saved.project.relationships.map((relationship) => relationship.id)
  const snapshot = await store.createSnapshot(projectId, 'Original', saved.project.revision)
  await store.apply(projectId, {
    baseRevision: saved.project.revision,
    source: 'human',
    message: 'Edit after snapshot',
    operations: [{ op: 'update_project', patch: { name: 'Changed after snapshot' } }],
  })
  const current = await store.get(projectId)
  const preview = await store.previewSnapshot(projectId, snapshot.id, current.project.revision)
  assert.equal(preview.project.name, saved.project.name)
  assert.equal((await store.get(projectId)).project.revision, current.project.revision)
  assert.deepEqual((await store.get(projectId)).history, current.history)

  const restored = await store.restoreSnapshot(projectId, snapshot.id, current.project.revision)
  assert.equal(restored.project.revision, current.project.revision + 1)
  assert.equal(restored.project.id, saved.project.id)
  assert.equal(restored.project.createdAt, saved.project.createdAt)
  assert.equal(restored.project.name, saved.project.name)
  assert.deepEqual(
    restored.project.components.map((component) => component.id),
    componentIds,
  )
  assert.deepEqual(
    restored.project.relationships.map((relationship) => relationship.id),
    relationshipIds,
  )
  assert.equal(restored.history[0].source, 'human')
  assert.equal(restored.canUndo, true)
  const undone = await store.travel(projectId, restored.project.revision, 'undo')
  assert.equal(undone.project.name, 'Changed after snapshot')
  assert.equal(undone.project.revision, restored.project.revision + 1)
})

test('stale snapshot creation, preview, and restore leave state unchanged', async () => {
  const snapshot = await store.createSnapshot(projectId, 'For stale test', initialProject.revision)
  await store.apply(projectId, {
    baseRevision: 0,
    source: 'human',
    message: '',
    operations: [{ op: 'update_project', patch: { description: 'Newer revision' } }],
  })
  const current = await store.get(projectId)
  await assert.rejects(
    store.createSnapshot(projectId, 'Stale create', current.project.revision - 1),
    (error: unknown) => error instanceof ModelError && error.code === 'REVISION_CONFLICT',
  )
  const state = await store.get(projectId)
  await assert.rejects(
    store.previewSnapshot(projectId, snapshot.id, state.project.revision - 1),
    (error: unknown) => error instanceof ModelError && error.code === 'REVISION_CONFLICT',
  )
  await assert.rejects(
    store.restoreSnapshot(projectId, snapshot.id, state.project.revision - 1),
    (error: unknown) => error instanceof ModelError && error.code === 'REVISION_CONFLICT',
  )
  assert.deepEqual(await store.get(projectId), state)
})

test('corrupt, unsupported, primitive, and dangling-reference snapshot records are rejected without writes', async () => {
  const snapshot = await store.createSnapshot(
    projectId,
    'Protected source',
    initialProject.revision,
  )
  const filename = path.join(store.snapshotDirectory, projectId, `${snapshot.id}.json`)
  const originalText = await readFile(filename, 'utf8')
  const state = await store.get(projectId)
  const original = JSON.parse(originalText) as Record<string, any>

  await writeFile(filename, '{broken', 'utf8')
  await assert.rejects(
    store.getSnapshot(projectId, snapshot.id),
    (error: unknown) => error instanceof ModelError && error.code === 'SNAPSHOT_INVALID',
  )
  await writeFile(filename, JSON.stringify({ ...original, snapshotVersion: 2 }), 'utf8')
  await assert.rejects(
    store.restoreSnapshot(projectId, snapshot.id, state.project.revision),
    (error: unknown) =>
      error instanceof ModelError && error.code === 'SNAPSHOT_VERSION_UNSUPPORTED',
  )
  await writeFile(
    filename,
    JSON.stringify({ ...original, project: { ...original.project, schemaVersion: 2 } }),
    'utf8',
  )
  await assert.rejects(
    store.getSnapshot(projectId, snapshot.id),
    (error: unknown) => error instanceof ModelError && error.code === 'PROJECT_VERSION_UNSUPPORTED',
  )
  await writeFile(
    filename,
    JSON.stringify({
      ...original,
      project: {
        ...original.project,
        relationships: original.project.relationships.map(
          (relationship: Record<string, unknown>, index: number) =>
            index === 0 ? { ...relationship, target: 'missing-component' } : relationship,
        ),
      },
    }),
    'utf8',
  )
  await assert.rejects(
    store.getSnapshot(projectId, snapshot.id),
    (error: unknown) => error instanceof ModelError && error.code === 'SNAPSHOT_INVALID',
  )
  const primitiveId = 'snp_primitive'
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(path.join(path.dirname(filename), `${primitiveId}.json`), 'null', 'utf8')
  await assert.rejects(
    store.getSnapshot(projectId, primitiveId),
    (error: unknown) => error instanceof ModelError && error.code === 'SNAPSHOT_INVALID',
  )
  assert.deepEqual(await store.get(projectId), state)
})

test('snapshot download exports only the canonical Project, never its storage wrapper', async () => {
  const { directory: exportDirectory, store: exportStore, project } = await fixture()
  const serverApp = express()
  mountSnapshotRoutes(serverApp, exportStore)
  const server: Server = createServer(serverApp)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  try {
    const snapshot = await exportStore.createSnapshot(project.id, 'Portable copy', project.revision)
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/projects/${project.id}/snapshots/${snapshot.id}/export`,
    )
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-disposition') ?? '', /attachment/)
    const backup = (await response.json()) as Record<string, unknown>
    assert.equal(backup.schemaVersion, 1)
    assert.equal(backup.id, project.id)
    assert.equal('snapshotVersion' in backup, false)
    assert.equal('project' in backup, false)
    assert.equal('history' in backup, false)
    assert.equal('undo' in backup, false)
    assert.equal('redo' in backup, false)
    assert.equal('apiKey' in backup, false)
  } finally {
    await new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
    await cleanup(exportDirectory)
  }
})

test('snapshot storage additions leave existing schemaVersion 1 project wrappers readable', async () => {
  const project = await store.get(projectId)
  assert.equal(project.project.schemaVersion, 1)
  assert.equal(project.project.revision, initialProject.revision)
  assert.equal(
    (await store.list()).some((item) => item.id === projectId),
    true,
  )
})
