import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import { ProviderSettings, ProviderSettingsSchema, testProviderConnection } from './provider'

export function createRequestAbort(
  req: Request,
  res: Response,
): {
  signal: AbortSignal
  dispose: () => void
} {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const onResponseClose = () => {
    if (!res.writableEnded) abort()
  }
  if (req.aborted || res.destroyed) abort()
  req.once('aborted', abort)
  res.once('close', onResponseClose)
  if (req.aborted || (res.destroyed && !res.writableEnded)) abort()
  return {
    signal: controller.signal,
    dispose: () => {
      req.off('aborted', abort)
      res.off('close', onResponseClose)
    },
  }
}

export function mountProviderRoutes(app: Express, providers: ProviderSettings): void {
  app.get('/api/settings/provider', async (_req, res) => res.json(await providers.publicSettings()))
  app.put('/api/settings/provider', async (req, res) =>
    res.json(await providers.save(ProviderSettingsSchema.parse(req.body))),
  )
  app.post('/api/settings/provider/test', async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body === undefined ? {} : req.body)
    const config = await providers.getSaved()
    const request = createRequestAbort(req, res)
    try {
      res.json(await testProviderConnection(config, { signal: request.signal }))
    } finally {
      request.dispose()
    }
  })
}
