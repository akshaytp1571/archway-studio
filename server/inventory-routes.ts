import type { Express } from 'express'
import { z } from 'zod'
import { IdSchema, validateArchitecture } from '../shared/model'
import { planInventory } from '../shared/inventory'
import { ProjectStore, RevisionConflict } from './store'

export function mountInventoryRoutes(app: Express, store: ProjectStore) {
  app.post('/api/projects/:id/inventory/preview', async (req, res) => {
    const id = IdSchema.parse(req.params.id)
    const input = z
      .object({ baseRevision: z.number().int().nonnegative(), inventory: z.unknown() })
      .strict()
      .parse(req.body)
    const { project } = await store.get(id)
    if (project.revision !== input.baseRevision) throw new RevisionConflict(project)
    const plan = planInventory(project, input.inventory)
    const preview = plan.operations.length
      ? await store.preview(id, {
          baseRevision: input.baseRevision,
          operations: plan.operations,
          source: 'import',
          message: plan.summary,
        })
      : { project, validation: validateArchitecture(project) }
    res.json({
      ...plan,
      proposedProject: preview.project,
      validation: preview.validation,
      baseRevision: input.baseRevision,
    })
  })
}
