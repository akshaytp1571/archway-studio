import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ChangeRequestSchema,
  ComponentSchema,
  OperationSchema,
  ProjectSchema,
  applyOperations,
  analyzeImpact,
  validateArchitecture,
  visibleComponents,
} from '../shared/model'
import { createProject, recipePlan } from '../shared/templates'
import { autoLayout } from '../shared/layout'
import { exportMermaid, exportSvg } from '../shared/export'

test('all starter templates are schema-valid and semantically valid', () => {
  for (const id of ['commerce', 'saas', 'blank'] as const) {
    const project = createProject(id)
    assert.equal(ProjectSchema.safeParse(project).success, true)
    assert.equal(validateArchitecture(project).valid, true)
  }
})
test('partial component edits preserve unspecified values', () => {
  const before = createProject(),
    original = before.components[0]
  const operation = OperationSchema.parse({
    op: 'update_component',
    id: original.id,
    patch: { name: 'New storefront' },
  })
  const after = applyOperations(before, [operation])
  assert.equal(after.components[0].name, 'New storefront')
  assert.equal(after.components[0].technology, original.technology)
  assert.deepEqual(after.components[0].tags, original.tags)
  assert.equal(before.components[0].name, original.name)
})
test('dangling relationships are rejected atomically', () => {
  const project = createProject(),
    original = structuredClone(project)
  const operations = ChangeRequestSchema.parse({
    baseRevision: 0,
    operations: [
      { op: 'update_project', patch: { name: 'Should not save' } },
      {
        op: 'add_relationship',
        relationship: { id: 'invalid', source: 'web-client', target: 'missing' },
      },
    ],
  }).operations
  assert.throws(() => applyOperations(project, operations), /invalid references/)
  assert.deepEqual(project, original)
})
test('component removal requires explicit cascading and cleans all view positions', () => {
  const project = createProject()
  assert.throws(
    () =>
      applyOperations(project, [
        OperationSchema.parse({ op: 'remove_component', id: 'order-service' }),
      ]),
    /cascade/,
  )
  const after = applyOperations(project, [
    OperationSchema.parse({ op: 'remove_component', id: 'order-service', cascade: true }),
  ])
  assert.equal(
    after.components.some((c) => c.id === 'order-service'),
    false,
  )
  assert.equal(
    after.relationships.some((r) => r.source === 'order-service' || r.target === 'order-service'),
    false,
  )
  for (const view of after.views) assert.equal('order-service' in view.layout.positions, false)
})
test('stable IDs reject traversal and duplicate component IDs', () => {
  assert.equal(
    ComponentSchema.safeParse({ id: '../escape', name: 'No', kind: 'service' }).success,
    false,
  )
  const project = createProject()
  assert.throws(
    () => applyOperations(project, [{ op: 'add_component', component: project.components[0] }]),
    /already exists/,
  )
})
test('boundaries cannot disappear while components reference them', () => {
  assert.throws(
    () => applyOperations(createProject(), [{ op: 'remove_boundary', id: 'application' }]),
    /before removing/,
  )
})
test('moving a card changes a view, not the semantic component', () => {
  const project = createProject(),
    after = applyOperations(project, [
      { op: 'set_layout', viewId: 'overview', positions: { 'web-client': { x: 500, y: 300 } } },
    ])
  assert.deepEqual(after.components, project.components)
  assert.deepEqual(after.relationships, project.relationships)
  assert.deepEqual(after.views[0].layout.positions['web-client'], { x: 500, y: 300 })
  assert.deepEqual(after.views[1], project.views[1])
})
test('view filters preserve the shared component identities', () => {
  const project = createProject()
  assert.deepEqual(
    visibleComponents(project, 'services').map((c) => c.kind),
    ['gateway', 'service', 'service', 'service'],
  )
})
test('impact analysis is directed and cycle-safe', () => {
  const project = createProject()
  project.relationships.push({
    id: 'cycle',
    source: 'order-service',
    target: 'api-gateway',
    label: '',
    protocol: '',
    interaction: 'sync',
    description: '',
  })
  const impact = analyzeImpact(project, 'order-service')
  assert.ok(impact.upstream.some((c) => c.id === 'web-client'))
  assert.ok(impact.downstream.some((c) => c.id === 'payment-provider'))
  assert.equal(
    impact.downstream.some((c) => c.id === 'order-service'),
    false,
  )
})
test('all deterministic recipes create valid proposals without mutating the source', () => {
  for (const recipe of ['notifications', 'cache', 'observability'] as const) {
    const project = createProject(),
      original = structuredClone(project),
      plan = recipePlan(project, recipe)
    assert.equal(validateArchitecture(applyOperations(project, plan.operations)).valid, true)
    assert.deepEqual(project, original)
    assert.equal(plan.mode, 'recipe')
  }
})
test('automatic layout gives finite positions for each visible node', () => {
  const project = createProject(),
    positions = autoLayout(project, 'overview')
  assert.equal(Object.keys(positions).length, 8)
  for (const position of Object.values(positions))
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y))
})
test('SVG output escapes user content and Mermaid uses safe generated IDs', () => {
  const project = createProject()
  project.name = '<script>alert("x")</script>'
  project.components[0].name = '<img onerror="x">'
  const svg = exportSvg(project)
  assert.ok(svg.includes('&lt;script&gt;'))
  assert.equal(svg.includes('<script>'), false)
  assert.ok(exportMermaid(project).includes('flowchart LR'))
  assert.ok(exportMermaid(project).includes('n0'))
})
