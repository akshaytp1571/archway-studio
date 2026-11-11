import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOperations, OperationSchema, validateArchitecture } from '../shared/model'
import { createProject } from '../shared/templates'
import { diffProjects } from '../shared/diff'
import { searchComponents } from '../shared/search'
import { planInventory } from '../shared/inventory'
import { createLargeProject } from '../shared/performance-fixture'

test('semantic diffs match stable IDs, ignore server metadata, and show cascade removals and nested fields', () => {
  const before = createProject(),
    after = applyOperations(before, [
      { op: 'update_component', id: before.components[0].id, patch: { metadata: { zone: 'A' } } },
      { op: 'remove_component', id: before.components[1].id, cascade: true },
    ])
  const diff = diffProjects(before, after)
  assert.ok(diff.some((item) => item.entity === 'component' && item.change === 'removed'))
  assert.ok(diff.some((item) => item.entity === 'relationship' && item.change === 'removed'))
  assert.ok(
    diff.some((item) =>
      item.fields.some((field) => field.field === 'metadata.zone' && field.after === 'A'),
    ),
  )
  const metadata = structuredClone(before)
  metadata.revision++
  metadata.updatedAt = new Date().toISOString()
  assert.deepEqual(diffProjects(before, metadata), [])
  const reordered = structuredClone(before)
  reordered.components.reverse()
  assert.deepEqual(diffProjects(before, reordered), [])
})
test('literal semantic search includes IDs owners tags and Unicode and remains bounded', () => {
  const project = createLargeProject()
  assert.equal(searchComponents(project, 'component-250')[0].id, 'component-250')
  assert.ok(
    searchComponents(project, 'group-5').every((component) => component.tags.includes('group-5')),
  )
  assert.equal(searchComponents(project, '').length, 30)
  assert.equal(searchComponents(project, '', -1).length, 0)
  assert.deepEqual(searchComponents(project, '[.*]'), [])
  project.components[0].name = 'Café'
  assert.equal(searchComponents(project, 'CAFE\u0301')[0].id, 'component-0')
  assert.equal(searchComponents(project, 'Benchmark only').length, 30)
})
test('local inventory plans preserve omissions, stable IDs, unrelated entities, and original model', () => {
  const project = createProject(),
    original = structuredClone(project),
    component = project.components[0]
  const plan = planInventory(project, {
    inventoryVersion: 1,
    components: [
      { id: component.id, kind: component.kind, name: 'Inventory rename' },
      { id: 'inventory-added', kind: 'service', name: 'New service' },
    ],
    relationships: [{ id: 'inventory-link', source: component.id, target: 'inventory-added' }],
  })
  assert.deepEqual(project, original)
  assert.equal(plan.report.added, 2)
  assert.equal(plan.report.updated, 1)
  assert.ok(
    plan.operations.every((op) => !op.op.startsWith('remove') && op.op !== 'replace_content'),
  )
  const after = applyOperations(project, plan.operations)
  assert.equal(
    after.components.find((value) => value.id === component.id)?.technology,
    component.technology,
  )
  assert.equal(after.components.length, project.components.length + 1)
  assert.ok(validateArchitecture(after).valid)
  assert.equal(
    planInventory(project, {
      inventoryVersion: 1,
      components: [{ id: component.id, kind: component.kind, name: component.name }],
    }).operations.length,
    0,
  )
})
test('inventory rejects duplicate IDs, references, unknown input and oversized batches atomically', () => {
  const project = createProject(),
    original = structuredClone(project),
    component = { id: 'dup', kind: 'service', name: 'Duplicate' }
  assert.throws(
    () => planInventory(project, { inventoryVersion: 1, components: [component, component] }),
    /Duplicate/,
  )
  assert.throws(() =>
    planInventory(project, {
      inventoryVersion: 1,
      components: [],
      relationships: [{ id: 'bad', source: 'missing', target: 'missing' }],
    }),
  )
  assert.throws(() =>
    planInventory(project, { inventoryVersion: 1, components: [], command: 'rm' }),
  )
  assert.throws(
    () =>
      planInventory(project, {
        inventoryVersion: 1,
        components: Array.from({ length: 101 }, (_, i) => ({
          id: `added-${i}`,
          kind: 'service',
          name: `Added ${i}`,
        })),
      }),
    /100/,
  )
  assert.deepEqual(project, original)
})
test('maximum-size synthetic fixture is valid and edits preserve count and original state', () => {
  const project = createLargeProject()
  assert.equal(project.components.length, 500)
  assert.equal(project.relationships.length, 1500)
  assert.ok(validateArchitecture(project).valid)
  const after = applyOperations(project, [
    OperationSchema.parse({
      op: 'update_component',
      id: 'component-250',
      patch: { technology: 'Rust' },
    }),
  ])
  assert.equal(project.components[250].technology, 'TypeScript')
  assert.equal(after.components[250].technology, 'Rust')
  assert.equal(after.relationships.length, 1500)
})
