import express from 'express'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createApplication } from './app'

const root = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.PORT ?? 4317)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer from 1024 to 65535.')
const production = process.argv.includes('--production')
const { app } = await createApplication(
  path.resolve(process.env.ARCHWAY_DATA_DIR ?? path.join(root, 'data')),
)
const server = createServer(app)
let closeVite: (() => Promise<void>) | undefined
if (production) {
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    )
    next()
  })
  app.use(express.static(path.join(root, 'dist'), { maxAge: '1h', index: false }))
  app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: path.join(root, 'dist') }))
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  })
  app.use(vite.middlewares)
  closeVite = () => vite.close()
}
server.on('error', (error) => {
  console.error('Archway could not start:', error.message)
  process.exit(1)
})
server.listen(port, '127.0.0.1', () => {
  console.log(
    `\n  Archway is ready\n  App:  http://127.0.0.1:${port}\n  MCP:  http://127.0.0.1:${port}/mcp\n  Mode: ${production ? 'production' : 'development'}\n\n  Local-only MVP. Do not expose this server publicly without authentication.\n`,
  )
})
async function shutdown() {
  await closeVite?.()
  server.close(() => process.exit(0))
}
process.on('SIGINT', () => {
  void shutdown()
})
process.on('SIGTERM', () => {
  void shutdown()
})
