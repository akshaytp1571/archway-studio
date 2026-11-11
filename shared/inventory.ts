import { z } from 'zod'
import {
  BoundarySchema,
  ComponentKindSchema,
  ComponentPatchSchema,
  IdSchema,
  ModelError,
  OperationSchema,
  RelationshipPatchSchema,
  applyOperations,
  type Operation,
  type Project,
} from './model'

const InventoryComponent = ComponentPatchSchema.extend({
  id: IdSchema,
  kind: ComponentKindSchema,
  name: z.string().trim().min(1).max(100),
}).strict()
const InventoryRelationship = RelationshipPatchSchema.extend({
  id: IdSchema,
  source: IdSchema,
  target: IdSchema,
}).strict()
const InventoryBoundary = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(100),
    type: BoundarySchema.shape.type.removeDefault().optional(),
    description: z.string().max(1000).optional(),
  })
  .strict()
export const InventorySchema = z
  .object({
    inventoryVersion: z.literal(1),
    components: z.array(InventoryComponent).max(500),
    relationships: z.array(InventoryRelationship).max(1500).default([]),
    boundaries: z.array(InventoryBoundary).max(100).default([]),
  })
  .strict()
export type InventoryReport = {
  added: number
  updated: number
  unchanged: number
  skipped: number
  warnings: string[]
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
/** Maps one explicit local inventory into reviewable additions/updates, never deletions. */
export function planInventory(project: Project, input: unknown) {
  const inventory = InventorySchema.parse(input)
  const report: InventoryReport = {
    added: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    warnings: [
      'Only explicitly supplied fields are mapped. Existing entities and omitted properties are retained. No source code or cloud resources are scanned.',
    ],
  }
  const operations: Operation[] = []
  for (const [entity, items, saved] of [
    ['boundary', inventory.boundaries, project.boundaries],
    ['component', inventory.components, project.components],
    ['relationship', inventory.relationships, project.relationships],
  ] as const) {
    const seen = new Set<string>()
    for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
      if (seen.has(item.id))
        throw new ModelError('INVENTORY_DUPLICATE_ID', 422, `Duplicate ${entity} ID: ${item.id}`)
      seen.add(item.id)
      const existing = saved.find((value) => value.id === item.id)
      if (!existing) {
        const field =
          entity === 'boundary' ? 'boundary' : entity === 'component' ? 'component' : 'relationship'
        operations.push(OperationSchema.parse({ op: `add_${entity}`, [field]: item }))
        report.added++
      } else {
        const patch: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(item)) {
          if (
            key !== 'id' &&
            canonical(value) !== canonical((existing as unknown as Record<string, unknown>)[key])
          )
            patch[key] = value
        }
        if (Object.keys(patch).length) {
          operations.push(OperationSchema.parse({ op: `update_${entity}`, id: item.id, patch }))
          report.updated++
        } else report.unchanged++
      }
    }
  }
  if (operations.length > 100)
    throw new ModelError(
      'INVENTORY_TOO_LARGE',
      422,
      `This inventory proposes ${operations.length} changes; at most 100 fit in one atomic batch. Split the input into smaller complete inventories. Nothing was saved.`,
    )
  if (operations.length) applyOperations(project, operations)
  return {
    summary: `Local inventory: ${report.added} additions, ${report.updated} updates, ${report.unchanged} unchanged. Review before applying.`,
    operations,
    report,
    mode: 'inventory' as const,
  }
}
