import { z } from 'zod'

export const IdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/,
    'Use a stable ID with letters, numbers, underscores, dots, colons, or hyphens.',
  )
export const ComponentKindSchema = z.enum([
  'client',
  'gateway',
  'service',
  'database',
  'queue',
  'external',
])
export type ComponentKind = z.infer<typeof ComponentKindSchema>
export const PositionSchema = z
  .object({
    x: z.number().finite().min(-20000).max(20000),
    y: z.number().finite().min(-20000).max(20000),
  })
  .strict()
export const ComponentSchema = z
  .object({
    id: IdSchema,
    kind: ComponentKindSchema,
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000).default(''),
    technology: z.string().max(100).default(''),
    owner: z.string().max(100).default(''),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    boundaryId: IdSchema.nullable().default(null),
    metadata: z.record(z.string().max(80), z.string().max(1000)).default({}),
  })
  .strict()
export type Component = z.infer<typeof ComponentSchema>
export const ComponentPatchSchema = z
  .object({
    kind: ComponentKindSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
    technology: z.string().max(100).optional(),
    owner: z.string().max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    boundaryId: IdSchema.nullable().optional(),
    metadata: z.record(z.string().max(80), z.string().max(1000)).optional(),
  })
  .strict()
export const BoundarySchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(100),
    type: z.enum(['system', 'trust', 'network']).default('system'),
    description: z.string().max(1000).default(''),
  })
  .strict()
export type Boundary = z.infer<typeof BoundarySchema>
export const RelationshipSchema = z
  .object({
    id: IdSchema,
    source: IdSchema,
    target: IdSchema,
    label: z.string().max(100).default(''),
    protocol: z.string().max(60).default(''),
    interaction: z.enum(['sync', 'async']).default('sync'),
    description: z.string().max(1000).default(''),
  })
  .strict()
export type Relationship = z.infer<typeof RelationshipSchema>
export const RelationshipPatchSchema = z
  .object({
    source: IdSchema.optional(),
    target: IdSchema.optional(),
    label: z.string().max(100).optional(),
    protocol: z.string().max(60).optional(),
    interaction: z.enum(['sync', 'async']).optional(),
    description: z.string().max(1000).optional(),
  })
  .strict()
export const ViewSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(100),
    description: z.string().max(1000).default(''),
    kinds: z.array(ComponentKindSchema).default([]),
    layout: z
      .object({
        direction: z.enum(['LR', 'TB']).default('LR'),
        positions: z.record(IdSchema, PositionSchema).default({}),
      })
      .strict(),
  })
  .strict()
export type ArchitectureView = z.infer<typeof ViewSchema>
export const ViewPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(1000).optional(),
    kinds: z.array(ComponentKindSchema).optional(),
  })
  .strict()
export type ViewPatch = z.infer<typeof ViewPatchSchema>
export const ArchitectureContentSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000).default(''),
    components: z.array(ComponentSchema).max(500),
    relationships: z.array(RelationshipSchema).max(1500),
    boundaries: z.array(BoundarySchema).max(100),
    views: z.array(ViewSchema).min(1).max(30),
  })
  .strict()
export const ProjectSchema = ArchitectureContentSchema.extend({
  schemaVersion: z.literal(1),
  id: IdSchema,
  revision: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict()
export type Project = z.infer<typeof ProjectSchema>
export type ArchitectureContent = z.infer<typeof ArchitectureContentSchema>
export const OperationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('add_component'),
      component: ComponentSchema,
      position: PositionSchema.optional(),
    })
    .strict(),
  z
    .object({ op: z.literal('update_component'), id: IdSchema, patch: ComponentPatchSchema })
    .strict(),
  z
    .object({
      op: z.literal('remove_component'),
      id: IdSchema,
      cascade: z.boolean().default(false),
    })
    .strict(),
  z.object({ op: z.literal('add_relationship'), relationship: RelationshipSchema }).strict(),
  z
    .object({ op: z.literal('update_relationship'), id: IdSchema, patch: RelationshipPatchSchema })
    .strict(),
  z.object({ op: z.literal('remove_relationship'), id: IdSchema }).strict(),
  z.object({ op: z.literal('add_boundary'), boundary: BoundarySchema }).strict(),
  z
    .object({
      op: z.literal('update_boundary'),
      id: IdSchema,
      patch: z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          type: z.enum(['system', 'trust', 'network']).optional(),
          description: z.string().max(1000).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal('remove_boundary'), id: IdSchema }).strict(),
  z
    .object({
      op: z.literal('update_project'),
      patch: z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          description: z.string().max(2000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_layout'),
      viewId: IdSchema,
      positions: z.record(IdSchema, PositionSchema),
      direction: z.enum(['LR', 'TB']).optional(),
    })
    .strict(),
  z.object({ op: z.literal('add_view'), view: ViewSchema }).strict(),
  z.object({ op: z.literal('update_view'), id: IdSchema, patch: ViewPatchSchema }).strict(),
  z.object({ op: z.literal('remove_view'), id: IdSchema }).strict(),
  z.object({ op: z.literal('replace_content'), content: ArchitectureContentSchema }).strict(),
])
export type Operation = z.infer<typeof OperationSchema>
export const ChangeRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    operations: z.array(OperationSchema).min(1).max(100),
    source: z.enum(['human', 'agent', 'import', 'undo', 'redo']).default('agent'),
    message: z.string().max(240).default(''),
  })
  .strict()
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>
export type ValidationIssue = { code: string; path: string; message: string }
export type ValidationReport = {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}
export type ChangeEvent = {
  id: string
  revision: number
  timestamp: string
  source: ChangeRequest['source']
  message: string
  operations: string[]
}
export type ProjectSummary = Pick<
  Project,
  'id' | 'name' | 'description' | 'revision' | 'updatedAt'
> & { componentCount: number; relationshipCount: number }
export class ModelError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public issues: ValidationIssue[] = [],
  ) {
    super(message)
  }
}

export function contentOf(project: Project): ArchitectureContent {
  return structuredClone({
    name: project.name,
    description: project.description,
    components: project.components,
    relationships: project.relationships,
    boundaries: project.boundaries,
    views: project.views,
  })
}
export function visibleComponents(project: Project, viewId: string): Component[] {
  const view = project.views.find((v) => v.id === viewId) ?? project.views[0]
  return view.kinds.length
    ? project.components.filter((c) => view.kinds.includes(c.kind))
    : project.components
}
export function validateArchitecture(project: Project): ValidationReport {
  const errors: ValidationIssue[] = [],
    warnings: ValidationIssue[] = []
  const issue = (code: string, path: string, message: string) =>
    errors.push({ code, path, message })
  for (const [key, list] of [
    ['components', project.components],
    ['relationships', project.relationships],
    ['boundaries', project.boundaries],
    ['views', project.views],
  ] as const) {
    const seen = new Set<string>()
    for (const item of list) {
      if (seen.has(item.id))
        issue('DUPLICATE_ID', `${key}.${item.id}`, `Duplicate ${key} ID: ${item.id}`)
      seen.add(item.id)
    }
  }
  const ids = new Set(project.components.map((c) => c.id)),
    boundaries = new Set(project.boundaries.map((b) => b.id))
  for (const component of project.components) {
    if (component.boundaryId && !boundaries.has(component.boundaryId))
      issue(
        'MISSING_BOUNDARY',
        `components.${component.id}.boundaryId`,
        `Boundary ${component.boundaryId} does not exist.`,
      )
    if (
      project.components.length > 1 &&
      !project.relationships.some((r) => r.source === component.id || r.target === component.id)
    )
      warnings.push({
        code: 'ISOLATED_COMPONENT',
        path: `components.${component.id}`,
        message: `${component.name} has no connections.`,
      })
  }
  for (const rel of project.relationships) {
    if (!ids.has(rel.source))
      issue(
        'MISSING_SOURCE',
        `relationships.${rel.id}.source`,
        `Source ${rel.source} does not exist.`,
      )
    if (!ids.has(rel.target))
      issue(
        'MISSING_TARGET',
        `relationships.${rel.id}.target`,
        `Target ${rel.target} does not exist.`,
      )
    if (rel.source === rel.target)
      warnings.push({
        code: 'SELF_RELATIONSHIP',
        path: `relationships.${rel.id}`,
        message: `${rel.id} connects a component to itself.`,
      })
  }
  for (const view of project.views)
    for (const id of Object.keys(view.layout.positions)) {
      if (!ids.has(id))
        issue(
          'STALE_POSITION',
          `views.${view.id}.layout.positions.${id}`,
          `Layout references missing component ${id}.`,
        )
    }
  const names = new Set<string>()
  for (const component of project.components) {
    const key = component.name.toLowerCase()
    if (names.has(key))
      warnings.push({
        code: 'DUPLICATE_NAME',
        path: `components.${component.id}.name`,
        message: `More than one component is named ${component.name}. Stable IDs keep them distinct.`,
      })
    names.add(key)
  }
  return { valid: errors.length === 0, errors, warnings }
}
export function assertValid(project: Project): void {
  const report = validateArchitecture(project)
  if (!report.valid)
    throw new ModelError(
      'MODEL_INVALID',
      422,
      'The proposed architecture has invalid references.',
      report.errors,
    )
}
function requireItem<T extends { id: string }>(items: T[], id: string, kind: string): T {
  const found = items.find((item) => item.id === id)
  if (!found) throw new ModelError('NOT_FOUND', 404, `${kind} ${id} does not exist.`)
  return found
}
function unique(items: { id: string }[], id: string): void {
  if (items.some((item) => item.id === id))
    throw new ModelError('DUPLICATE_ID', 422, `ID ${id} already exists.`)
}
export function applyOperations(project: Project, operations: Operation[]): Project {
  const next = structuredClone(project)
  for (const operation of operations) {
    switch (operation.op) {
      case 'add_component': {
        unique(next.components, operation.component.id)
        next.components.push(structuredClone(operation.component))
        for (const view of next.views) {
          const positions = Object.values(view.layout.positions)
          view.layout.positions[operation.component.id] = operation.position ?? {
            x: positions.length
              ? Math.min(19000, Math.max(...positions.map((p) => p.x)) + 290)
              : 100,
            y: 170 + (next.components.length % 3) * 160,
          }
        }
        break
      }
      case 'update_component':
        Object.assign(requireItem(next.components, operation.id, 'Component'), operation.patch)
        break
      case 'remove_component': {
        requireItem(next.components, operation.id, 'Component')
        const connected = next.relationships.filter(
          (r) => r.source === operation.id || r.target === operation.id,
        )
        if (connected.length && !operation.cascade)
          throw new ModelError(
            'HAS_RELATIONSHIPS',
            422,
            `Component ${operation.id} has ${connected.length} relationships. Set cascade to true to remove them explicitly.`,
          )
        next.components = next.components.filter((c) => c.id !== operation.id)
        next.relationships = next.relationships.filter(
          (r) => r.source !== operation.id && r.target !== operation.id,
        )
        for (const view of next.views) delete view.layout.positions[operation.id]
        break
      }
      case 'add_relationship':
        unique(next.relationships, operation.relationship.id)
        next.relationships.push(structuredClone(operation.relationship))
        break
      case 'update_relationship':
        Object.assign(
          requireItem(next.relationships, operation.id, 'Relationship'),
          operation.patch,
        )
        break
      case 'remove_relationship':
        requireItem(next.relationships, operation.id, 'Relationship')
        next.relationships = next.relationships.filter((r) => r.id !== operation.id)
        break
      case 'add_boundary':
        unique(next.boundaries, operation.boundary.id)
        next.boundaries.push(structuredClone(operation.boundary))
        break
      case 'update_boundary':
        Object.assign(requireItem(next.boundaries, operation.id, 'Boundary'), operation.patch)
        break
      case 'remove_boundary': {
        requireItem(next.boundaries, operation.id, 'Boundary')
        if (next.components.some((c) => c.boundaryId === operation.id))
          throw new ModelError(
            'BOUNDARY_IN_USE',
            422,
            'Move the components out of this boundary before removing it.',
          )
        next.boundaries = next.boundaries.filter((b) => b.id !== operation.id)
        break
      }
      case 'update_project':
        Object.assign(next, operation.patch)
        break
      case 'set_layout': {
        const view = requireItem(next.views, operation.viewId, 'View')
        Object.assign(view.layout.positions, structuredClone(operation.positions))
        if (operation.direction) view.layout.direction = operation.direction
        break
      }
      case 'add_view':
        unique(next.views, operation.view.id)
        next.views.push(structuredClone(operation.view))
        break
      case 'update_view':
        Object.assign(requireItem(next.views, operation.id, 'View'), operation.patch)
        break
      case 'remove_view': {
        requireItem(next.views, operation.id, 'View')
        if (next.views.length === 1)
          throw new ModelError('LAST_VIEW', 422, 'An architecture needs at least one view.')
        next.views = next.views.filter((v) => v.id !== operation.id)
        break
      }
      case 'replace_content':
        Object.assign(next, structuredClone(operation.content))
        break
    }
  }
  const parsed = ProjectSchema.parse(next)
  assertValid(parsed)
  return parsed
}
export function describeOperation(operation: Operation): string {
  switch (operation.op) {
    case 'add_component':
      return `Add ${operation.component.name}`
    case 'update_component':
      return `Update ${operation.id}`
    case 'remove_component':
      return `Remove ${operation.id}${operation.cascade ? ' and its connections' : ''}`
    case 'add_relationship':
      return `Connect ${operation.relationship.source} → ${operation.relationship.target}`
    case 'update_relationship':
      return `Update connection ${operation.id}`
    case 'remove_relationship':
      return `Remove connection ${operation.id}`
    case 'add_boundary':
      return `Add boundary ${operation.boundary.name}`
    case 'update_boundary':
      return `Update boundary ${operation.id}`
    case 'remove_boundary':
      return `Remove boundary ${operation.id}`
    case 'update_project':
      return 'Update project details'
    case 'set_layout':
      return `Arrange ${Object.keys(operation.positions).length} components`
    case 'add_view':
      return `Add view ${operation.view.name}`
    case 'update_view':
      return `Update view ${operation.id}`
    case 'remove_view':
      return `Remove view ${operation.id}`
    case 'replace_content':
      return 'Replace architecture content'
  }
}
export function analyzeImpact(project: Project, componentId: string) {
  const component = requireItem(project.components, componentId, 'Component')
  const traverse = (direction: 'upstream' | 'downstream') => {
    const visited = new Set<string>([componentId]),
      queue = [componentId]
    while (queue.length) {
      const id = queue.shift()!
      for (const rel of project.relationships) {
        const adjacent =
          direction === 'upstream'
            ? rel.target === id
              ? rel.source
              : null
            : rel.source === id
              ? rel.target
              : null
        if (adjacent && !visited.has(adjacent)) {
          visited.add(adjacent)
          queue.push(adjacent)
        }
      }
    }
    visited.delete(componentId)
    return project.components
      .filter((c) => visited.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
  }
  return {
    component,
    upstream: traverse('upstream'),
    downstream: traverse('downstream'),
    directRelationships: project.relationships.filter(
      (r) => r.source === componentId || r.target === componentId,
    ),
    affectedViews: project.views
      .filter((v) => !v.kinds.length || v.kinds.includes(component.kind))
      .map((v) => ({ id: v.id, name: v.name })),
  }
}
