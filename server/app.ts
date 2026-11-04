import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ChangeRequestSchema,
  IdSchema,
  ModelError,
  ProjectSchema,
  analyzeImpact,
} from '../shared/model'
import { exportMermaid, exportSvg } from '../shared/export'
import { recipePlan } from '../shared/templates'
import { LiveProjectStore } from './live-store'
import { RevisionConflict } from './store'
import { ProviderSettings, ProviderSettingsSchema, planWithProvider } from './provider'
import { createMcpServer } from './mcp'

const idOf = (req: Request) => IdSchema.parse(req.params.id)
export async function createApplication(dataDirectory: string, seed = true) {
  const app = express(),
    store = new LiveProjectStore(dataDirectory),
    providers = new ProviderSettings(dataDirectory)
  await store.initialize(seed)
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const host = req.headers.host?.split(':')[0]
    if (host !== '127.0.0.1' && host !== 'localhost')
      return res
        .status(403)
        .json({ code: 'HOST_DENIED', message: 'Archway accepts loopback hosts only.' })
    const origin = req.headers.origin,
      port = req.socket.localPort
    if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin))
      return res
        .status(403)
        .json({ code: 'ORIGIN_DENIED', message: 'Cross-origin requests are not allowed.' })
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.path.startsWith('/api') || req.path === '/mcp')
      res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '5mb' }))
  app.get('/api/health', async (_req, res) =>
    res.json({
      status: 'ok',
      version: '0.1.0',
      agentReady: true,
      aiConfigured: (await providers.get()).enabled,
      projectCount: (await store.list()).length,
    }),
  )
  app.get('/api/schema', (_req, res) =>
    res.json({
      project: z.toJSONSchema(ProjectSchema),
      changes: z.toJSONSchema(ChangeRequestSchema, { io: 'input' }),
    }),
  )
  app.get('/api/projects', async (_req, res) => res.json({ projects: await store.list() }))
  app.post('/api/projects', async (req, res) => {
    const input = z
      .object({
        template: z.enum(['commerce', 'saas', 'blank']).default('blank'),
        name: z.string().trim().min(1).max(100).optional(),
        import: ProjectSchema.optional(),
      })
      .strict()
      .parse(req.body)
    res.status(201).json(await store.create(input.template, input.name, undefined, input.import))
  })
  app.get('/api/projects/:id', async (req, res) => res.json(await store.get(idOf(req))))
  app.get('/api/projects/:id/context', async (req, res) => {
    const data = await store.get(idOf(req))
    res.json({
      project: data.project,
      validation: data.validation,
      capabilities: [
        'stable-ids',
        'typed-components',
        'atomic-batches',
        'revision-checks',
        'preview',
        'undo-redo',
        'impact-analysis',
        'live-events',
      ],
      changeEndpoint: `/api/projects/${data.project.id}/changes`,
      previewEndpoint: `/api/projects/${data.project.id}/changes/preview`,
      mcpEndpoint: '/mcp',
    })
  })
  app.post('/api/projects/:id/changes/preview', async (req, res) =>
    res.json(await store.preview(idOf(req), ChangeRequestSchema.parse(req.body))),
  )
  app.post('/api/projects/:id/changes', async (req, res) =>
    res.json(await store.apply(idOf(req), ChangeRequestSchema.parse(req.body))),
  )
  app.post('/api/projects/:id/history', async (req, res) => {
    const input = z
      .object({ baseRevision: z.number().int().nonnegative(), action: z.enum(['undo', 'redo']) })
      .strict()
      .parse(req.body)
    res.json(await store.travel(idOf(req), input.baseRevision, input.action))
  })
  app.get('/api/projects/:id/impact/:componentId', async (req, res) =>
    res.json(
      analyzeImpact((await store.get(idOf(req))).project, IdSchema.parse(req.params.componentId)),
    ),
  )
  app.get('/api/projects/:id/events', async (req, res) => {
    const id = idOf(req)
    await store.get(id)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write('event: ready\ndata: {}\n\n')
    const listener = (projectId: string, revision: number) => {
      if (projectId === id)
        res.write(`event: change\ndata: ${JSON.stringify({ projectId, revision })}\n\n`)
    }
    store.changes.on('change', listener)
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000)
    req.on('close', () => {
      clearInterval(heartbeat)
      store.changes.off('change', listener)
    })
  })
  app.get('/api/projects/:id/export', async (req, res) => {
    const { project } = await store.get(idOf(req)),
      format = z.enum(['json', 'svg', 'mermaid']).parse(req.query.format ?? 'json')
    const viewId = req.query.viewId ? IdSchema.parse(req.query.viewId) : project.views[0].id
    if (!project.views.some((v) => v.id === viewId))
      throw new ModelError('NOT_FOUND', 404, 'That view does not exist.')
    const filename =
      project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'architecture'
    res.attachment(`${filename}.${format === 'mermaid' ? 'mmd' : format}`)
    if (format === 'json') res.type('application/json').send(JSON.stringify(project, null, 2))
    else if (format === 'svg') res.type('image/svg+xml').send(exportSvg(project, viewId))
    else res.type('text/plain').send(exportMermaid(project, viewId))
  })
  app.get('/api/settings/provider', async (_req, res) => res.json(await providers.publicSettings()))
  app.put('/api/settings/provider', async (req, res) =>
    res.json(await providers.save(ProviderSettingsSchema.parse(req.body))),
  )
  app.post('/api/assistant/plan', async (req, res) => {
    const input = z
      .object({
        projectId: IdSchema,
        baseRevision: z.number().int().nonnegative(),
        prompt: z.string().trim().min(3).max(6000).optional(),
        recipeId: z.enum(['notifications', 'cache', 'observability']).optional(),
      })
      .strict()
      .refine(
        (value) => Boolean(value.prompt) !== Boolean(value.recipeId),
        'Provide a prompt or a recipe, not both.',
      )
      .parse(req.body)
    const { project } = await store.get(input.projectId)
    if (project.revision !== input.baseRevision) throw new RevisionConflict(project)
    let plan
    if (input.recipeId) {
      try {
        plan = recipePlan(project, input.recipeId)
      } catch (error) {
        throw new ModelError('RECIPE_UNAVAILABLE', 422, (error as Error).message)
      }
    } else plan = await planWithProvider(await providers.get(), project, input.prompt!)
    const preview = await store.preview(input.projectId, {
      baseRevision: input.baseRevision,
      operations: plan.operations,
      source: 'agent',
      message: plan.summary.slice(0, 240),
    })
    res.json({
      ...plan,
      proposedProject: preview.project,
      validation: preview.validation,
      baseRevision: input.baseRevision,
    })
  })
  app.post('/mcp', async (req, res, next) => {
    const server = createMcpServer(store),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      if (!res.headersSent) next(error)
    }
  })
  app.all('/mcp', (_req, res) =>
    res
      .status(405)
      .setHeader('Allow', 'POST')
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'This stateless MCP endpoint accepts POST requests.' },
        id: null,
      }),
  )
  app.use('/api', (_req, res) =>
    res.status(404).json({ code: 'NOT_FOUND', message: 'API endpoint not found.' }),
  )
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return
    if (error instanceof z.ZodError)
      return res.status(400).json({
        code: 'SCHEMA_INVALID',
        message: 'The request does not match the schema.',
        issues: error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    if (error instanceof ModelError)
      return res.status(error.status).json({
        code: error.code,
        message: error.message,
        issues: error.issues,
        ...(error instanceof RevisionConflict
          ? { currentRevision: error.currentProject.revision }
          : {}),
      })
    if ((error as { type?: string }).type === 'entity.parse.failed')
      return res
        .status(400)
        .json({ code: 'INVALID_JSON', message: 'The request body must be valid JSON.' })
    if ((error as { type?: string }).type === 'entity.too.large')
      return res
        .status(413)
        .json({ code: 'BODY_TOO_LARGE', message: 'The request exceeds the 5 MB limit.' })
    console.error('Archway request failed:', error)
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on the server. Check the server logs.',
    })
  })
  return { app, store, providers }
}
