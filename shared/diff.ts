import type { Project } from './model'
export type ProjectDiff = {
  entity: 'project' | 'component' | 'relationship' | 'boundary' | 'view'
  id: string
  change: 'added' | 'removed' | 'updated'
  fields: { field: string; before?: unknown; after?: unknown }[]
}
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, index) => equal(value, b[index]))
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>
    const keys = Object.keys(left)
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
    )
  }
  return false
}
function fields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  prefix = '',
): ProjectDiff['fields'] {
  const result: ProjectDiff['fields'] = []
  for (const key of [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].sort()) {
    if (!prefix && key === 'id') continue
    const old = before?.[key],
      next = after?.[key],
      field = prefix ? `${prefix}.${key}` : key
    if (equal(old, next)) continue
    if (
      old !== null &&
      next !== null &&
      typeof old === 'object' &&
      typeof next === 'object' &&
      !Array.isArray(old) &&
      !Array.isArray(next)
    )
      result.push(...fields(old as Record<string, unknown>, next as Record<string, unknown>, field))
    else
      result.push({
        field,
        ...(old === undefined ? {} : { before: structuredClone(old) }),
        ...(next === undefined ? {} : { after: structuredClone(next) }),
      })
  }
  return result
}
/** Stable-identity semantic comparison; server revision/timestamp noise is excluded. */
export function diffProjects(before: Project, after: Project): ProjectDiff[] {
  const result: ProjectDiff[] = []
  const meta = fields(
    { name: before.name, description: before.description },
    { name: after.name, description: after.description },
  )
  if (meta.length)
    result.push({ entity: 'project', id: before.id, change: 'updated', fields: meta })
  for (const [entity, oldItems, newItems] of [
    ['component', before.components, after.components],
    ['relationship', before.relationships, after.relationships],
    ['boundary', before.boundaries, after.boundaries],
    ['view', before.views, after.views],
  ] as const) {
    const left = new Map(oldItems.map((item) => [item.id, item])),
      right = new Map(newItems.map((item) => [item.id, item]))
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const old = left.get(id),
        next = right.get(id)
      const changes = fields(
        old as unknown as Record<string, unknown> | undefined,
        next as unknown as Record<string, unknown> | undefined,
      )
      if (changes.length || !old || !next)
        result.push({
          entity,
          id,
          change: !old ? 'added' : !next ? 'removed' : 'updated',
          fields: changes,
        })
    }
  }
  return result
}
