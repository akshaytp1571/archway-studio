import express, { type Express, type Request } from 'express'
import { z } from 'zod'
import { IdSchema } from '../shared/model'
import { SnapshotNameSchema } from '../shared/snapshots'
import { ProjectStore } from './store'

const revisionBody = z.object({ baseRevision: z.number().int().nonnegative() }).strict()

export function mountSnapshotRoutes(app: Express, store: ProjectStore): void {
  const router = express.Router({ mergeParams: true })
  const projectId = (req: Request) => IdSchema.parse(req.params.id)
  const snapshotId = (value: unknown) => IdSchema.parse(value)

  router.get('/', async (req, res) => {
    res.json({ snapshots: await store.listSnapshots(projectId(req)) })
  })
  router.post('/', async (req, res) => {
    const input = z
      .object({ name: SnapshotNameSchema, baseRevision: z.number().int().nonnegative() })
      .strict()
      .parse(req.body)
    const snapshot = await store.createSnapshot(projectId(req), input.name, input.baseRevision)
    res.status(201).json({ snapshot })
  })
  router.post('/:snapshotId/preview', async (req, res) => {
    const input = revisionBody.parse(req.body)
    res.json(
      await store.previewSnapshot(
        projectId(req),
        snapshotId(req.params.snapshotId),
        input.baseRevision,
      ),
    )
  })
  router.post('/:snapshotId/restore', async (req, res) => {
    const input = revisionBody.parse(req.body)
    res.json(
      await store.restoreSnapshot(
        projectId(req),
        snapshotId(req.params.snapshotId),
        input.baseRevision,
      ),
    )
  })
  router.get('/:snapshotId/export', async (req, res) => {
    const snapshot = await store.getSnapshot(projectId(req), snapshotId(req.params.snapshotId))
    res.attachment(`${snapshot.id}.json`)
    res.type('application/json').send(JSON.stringify(snapshot.project, null, 2))
  })
  router.get('/:snapshotId', async (req, res) => {
    res.json(await store.getSnapshot(projectId(req), snapshotId(req.params.snapshotId)))
  })

  app.use('/api/projects/:id/snapshots', router)
}
