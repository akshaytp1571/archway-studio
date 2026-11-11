import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import express from 'express'
import { chromium } from 'playwright'
import { createApplication } from '../server/app'
export async function openBrowserFixture(prefix: string) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), prefix))
  const { app, store, providers } = await createApplication(dataDirectory, false)
  const state = await store.create('commerce', 'Milestone fixture', 'milestone-project')
  const webDist = path.resolve(process.env.ARCHWAY_BROWSER_DIST ?? 'dist')
  app.use(express.static(webDist))
  app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: webDist }))
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const candidates = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
    .filter((directory): directory is string => Boolean(directory))
    .flatMap((directory) => [
      path.join(directory, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(directory, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ])
  const executablePath =
    process.env.ARCHWAY_BROWSER_PATH ??
    (process.platform === 'win32'
      ? candidates.find((candidate) => existsSync(candidate))
      : undefined)
  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    })
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    assert.equal(path.dirname(dataDirectory), path.resolve(tmpdir()))
    await rm(dataDirectory, { recursive: true, force: true })
    throw error
  }
  const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      reducedMotion: 'reduce',
      acceptDownloads: true,
    }),
    page = await context.newPage(),
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return {
    page,
    context,
    browser,
    base,
    store,
    providers,
    state,
    errors,
    webDist,
    async close() {
      await context.close()
      await browser.close()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      assert.equal(path.dirname(dataDirectory), path.resolve(tmpdir()))
      assert.ok(path.basename(dataDirectory).startsWith(prefix))
      await rm(dataDirectory, { recursive: true, force: true })
    },
  }
}
export async function saveMeasurements(
  file: string,
  timings: Record<string, unknown>,
  webDist: string,
) {
  const target = path.resolve('artifacts', file)
  assert.equal(path.dirname(target), path.resolve('artifacts'))
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(
    target,
    JSON.stringify(
      {
        conditions: {
          node: process.version,
          platform: process.platform,
          cpu: cpus()[0]?.model,
          build: webDist,
          synthetic: true,
        },
        timings,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
}
