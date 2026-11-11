import { ProjectSchema, assertValid, type Project } from './model'
export function createLargeProject(): Project {
  const components = Array.from({ length: 500 }, (_, index) => ({
    id: `component-${index}`,
    kind: 'service' as const,
    name: `Synthetic service ${index}`,
    technology: 'TypeScript',
    owner: 'Benchmark only',
    tags: [`group-${index % 10}`],
  }))
  const relationships = Array.from({ length: 1500 }, (_, index) => ({
    id: `relationship-${index}`,
    source: `component-${index % 500}`,
    target: `component-${((index % 500) + Math.floor(index / 500) + 1) % 500}`,
    label: 'Synthetic dependency',
    protocol: 'HTTP',
  }))
  const positions = Object.fromEntries(
    components.map((component, index) => [
      component.id,
      { x: (index % 25) * 260, y: Math.floor(index / 25) * 180 },
    ]),
  )
  const project = ProjectSchema.parse({
    schemaVersion: 1,
    id: 'synthetic-large-project',
    revision: 0,
    createdAt: '2026-11-04T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
    name: '500-component benchmark',
    description: 'Synthetic data only; no real architecture or operational claims.',
    components,
    relationships,
    boundaries: [],
    views: [{ id: 'overview', name: 'All services', layout: { positions, direction: 'LR' } }],
  })
  assertValid(project)
  return project
}
