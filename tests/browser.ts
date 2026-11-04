import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import express from 'express'
import { chromium, type Page } from 'playwright'
import { createApplication } from '../server/app'

const root = process.cwd(),
  artifacts = path.join(root, 'artifacts'),
  webDist = path.resolve(root, process.env.ARCHWAY_BROWSER_DIST ?? 'dist')
await mkdir(artifacts, { recursive: true })
const dataDirectory = await mkdtemp(path.join(tmpdir(), 'archway-browser-test-'))
const { app } = await createApplication(dataDirectory)
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  )
  next()
})
app.use(express.static(webDist))
app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: webDist }))
const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const windowsDirectories = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
  (directory): directory is string => Boolean(directory),
)
const windowsBrowsers = windowsDirectories.flatMap((directory) => [
  path.join(directory, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(directory, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
])
const browserExecutable =
  process.env.ARCHWAY_BROWSER_PATH ??
  (process.platform === 'win32'
    ? windowsBrowsers.find((candidate) => existsSync(candidate))
    : undefined)
const browser = await chromium.launch({
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
})
const page = await context.newPage(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
let mockProvider: Server | undefined
const model = async (id = 'commerce-platform') =>
  (await (await page.request.get(`${base}/api/projects/${id}`)).json()).project
const waitRevision = async (revision: number) => {
  await page
    .locator('.workspace-statusbar')
    .getByText(`revision ${revision}`, { exact: true })
    .waitFor()
}
const expectNodes = async (count: number) => {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.architecture-node').length === expected,
    count,
  )
}
const settleViewport = async () =>
  page.evaluate(`new Promise(resolve => {
  let previous = '', stable = 0, frames = 0
  const check = () => {
    const transform = document.querySelector('.react-flow__viewport')?.style.transform ?? ''
    stable = transform === previous ? stable + 1 : 0; previous = transform
    if (stable >= 12 || frames++ > 180) resolve(); else requestAnimationFrame(check)
  }
  requestAnimationFrame(check)
})`)
const step = (message: string) => console.log(`PASS ${message}`)
const closePanel = async () => {
  if (await page.getByRole('button', { name: 'Close side panel', exact: true }).count())
    await page.getByRole('button', { name: 'Close side panel', exact: true }).click()
}
try {
  console.log(`Browser test URL: ${base}`)
  await page.goto(base)
  await expectNodes(8)
  await waitRevision(0)
  await settleViewport()
  await page.screenshot({
    path: path.join(artifacts, 'archway-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  assert.equal(await page.title(), 'Archway — Architecture studio')
  step('initial workspace and eight typed components render')

  await page.locator('[data-component-id="order-service"]').click()
  await page
    .locator('.inspector-panel')
    .getByLabel('Name', { exact: true })
    .fill('Order orchestration')
  await page.getByRole('button', { name: 'Save properties', exact: true }).click()
  await waitRevision(1)
  assert.equal(
    (await model()).components.find((c: any) => c.id === 'order-service').name,
    'Order orchestration',
  )
  step('property edits preserve stable component IDs')

  const beforeDrag = (await model()).views[0].layout.positions['order-service']
  const box = await page.locator('[data-component-id="order-service"]').boundingBox()
  assert.ok(box)
  await page.mouse.move(box.x + box.width / 2, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + 70, { steps: 12 })
  await page.mouse.up()
  await waitRevision(2)
  assert.notDeepEqual((await model()).views[0].layout.positions['order-service'], beforeDrag)
  step('dragging saves view layout separately from component semantics')

  await closePanel()
  await page.getByRole('button', { name: 'Fit architecture', exact: true }).click()
  await settleViewport()
  const source = await page
    .locator('[data-component-id="catalog-service"] .react-flow__handle-right')
    .boundingBox()
  const target = await page
    .locator('[data-component-id="session-store"] .react-flow__handle-left')
    .boundingBox()
  assert.ok(source && target)
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 })
  await page.mouse.up()
  const connect = page.getByRole('dialog', { name: 'Connect the dots' })
  await connect.waitFor()
  await connect.getByLabel('Relationship', { exact: true }).fill('Test asynchronous connection')
  await connect.getByLabel('Protocol', { exact: true }).fill('AMQP')
  await connect.getByLabel('Interaction', { exact: true }).selectOption('async')
  await connect.getByRole('button', { name: 'Create connection', exact: true }).click()
  await waitRevision(3)
  assert.equal((await model()).relationships.length, 9)
  step('dragging handles creates a typed relationship')

  await page.getByLabel('Architecture view', { exact: true }).selectOption('services')
  await expectNodes(4)
  await page.getByLabel('Architecture view', { exact: true }).selectOption('overview')
  await expectNodes(8)
  step('multiple views filter a shared model')

  await page.getByRole('button', { name: 'Assistant', exact: true }).click()
  await page.getByRole('button', { name: /Add a caching layer/ }).click()
  await page.getByText('Review proposal', { exact: true }).waitFor()
  await expectNodes(9)
  assert.equal((await model()).revision, 3)
  assert.equal((await model()).components.length, 8)
  await page.screenshot({
    path: path.join(artifacts, 'archway-proposal.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Apply 2 changes', exact: true }).click()
  await waitRevision(4)
  assert.equal((await model()).components.length, 9)
  step('recipes preview before applying one atomic transaction')
  await page.getByRole('button', { name: 'Undo change', exact: true }).click()
  await waitRevision(5)
  await expectNodes(8)
  await page.getByRole('button', { name: 'Redo change', exact: true }).click()
  await waitRevision(6)
  await expectNodes(9)
  step('undo and redo preserve monotonic revisions')

  let providerCalled = false
  mockProvider = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const request = JSON.parse(body)
    assert.equal(request.model, 'browser-test-model')
    assert.equal(req.url, '/v1/chat/completions')
    providerCalled = true
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Add a dedicated fraud scoring service.',
                operations: [
                  {
                    op: 'add_component',
                    component: {
                      id: 'fraud-scoring',
                      kind: 'service',
                      name: 'Fraud scoring',
                      technology: 'Python',
                      boundaryId: 'application',
                    },
                  },
                ],
              }),
            },
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => mockProvider!.listen(0, '127.0.0.1', resolve))
  await page
    .locator('.assistant-panel')
    .getByRole('button', { name: 'Configure model provider', exact: true })
    .click()
  const settings = page.getByRole('dialog', { name: 'Connect your architecture assistant' })
  await settings.waitFor()
  await settings
    .getByLabel('API base URL', { exact: true })
    .fill(`http://127.0.0.1:${(mockProvider.address() as { port: number }).port}/v1`)
  await settings.getByLabel('Model', { exact: true }).fill('browser-test-model')
  await settings.getByLabel(/^API key/).fill('browser-test-secret')
  await settings.getByRole('button', { name: 'Save provider', exact: true }).click()
  await settings.waitFor({ state: 'hidden' })
  const publicSettings = await (await page.request.get(`${base}/api/settings/provider`)).json()
  assert.equal(JSON.stringify(publicSettings).includes('browser-test-secret'), false)
  await page
    .getByLabel('Describe an architecture change', { exact: true })
    .fill('Add a fraud scoring service')
  await page.getByRole('button', { name: 'Generate a proposal', exact: true }).click()
  await page.getByText('Review proposal', { exact: true }).waitFor()
  assert.equal(providerCalled, true)
  assert.equal((await model()).components.length, 9)
  await page.getByRole('button', { name: 'Apply 1 change', exact: true }).click()
  await waitRevision(7)
  await expectNodes(10)
  const providerData = await (
    await page.request.get(`${base}/api/projects/commerce-platform`)
  ).json()
  assert.equal(providerData.history[0].source, 'agent')
  step(
    'provider settings and prompt → validated preview → apply work end-to-end with a mock provider',
  )

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Take your architecture with you.' })
  await exportDialog.waitFor()
  const downloadPromise = page.waitForEvent('download')
  await exportDialog.getByRole('button', { name: /Architecture model/ }).click()
  const download = await downloadPromise,
    exportFile = path.join(artifacts, 'browser-export.json')
  await download.saveAs(exportFile)
  assert.ok(download.suggestedFilename().endsWith('.json'))
  await exportDialog.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(exportFile)
  await page.getByRole('heading', { name: 'Commerce platform (imported)', exact: true }).waitFor()
  await expectNodes(10)
  const importedList = await (await page.request.get(`${base}/api/projects`)).json()
  assert.equal(importedList.projects.length, 2)
  step('JSON download and lossless import create an independent project')

  await page.getByRole('button', { name: 'Create new project', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Make room for a great idea.' })
  await create.waitFor()
  await create.getByLabel('Project name', { exact: true }).fill('Browser smoke test')
  await create.getByRole('button', { name: /Blank canvas/ }).click()
  await create.getByRole('button', { name: 'Create project', exact: true }).click()
  await page.getByRole('heading', { name: 'Browser smoke test', exact: true }).waitFor()
  await expectNodes(0)
  await page.getByRole('button', { name: 'Add first component', exact: true }).click()
  const add = page.getByRole('dialog', { name: 'Add a component' })
  await add.waitFor()
  await page.keyboard.press('Control+k')
  assert.equal(await add.isVisible(), true)
  assert.equal(await page.getByRole('dialog', { name: 'Find your way around' }).count(), 0)
  await add.getByLabel('Name', { exact: true }).fill('Smoke service')
  await add.getByRole('button', { name: 'Add component', exact: true }).click()
  await add.waitFor({ state: 'hidden' })
  await expectNodes(1)
  const allProjects = await (await page.request.get(`${base}/api/projects`)).json(),
    smokeId = allProjects.projects.find((p: any) => p.name === 'Browser smoke test').id
  step('project creation and blank-canvas component creation work')

  await page.keyboard.press('Control+k')
  const search = page.getByRole('dialog', { name: 'Find your way around' })
  await search.waitFor()
  await search.getByLabel('Search components', { exact: true }).fill('Smoke')
  await search.getByRole('button', { name: /Smoke service/ }).click()
  await page.getByRole('button', { name: 'Remove component', exact: true }).click()
  const remove = page.getByRole('dialog', { name: 'Remove Smoke service?' })
  await remove.waitFor()
  await remove.getByRole('button', { name: 'Remove', exact: true }).click()
  await expectNodes(0)
  await page.getByRole('button', { name: 'Undo change', exact: true }).click()
  await expectNodes(1)
  await page.reload()
  await expectNodes(1)
  await page.getByRole('heading', { name: 'Browser smoke test', exact: true }).waitFor()
  step('search, explicit deletion, undo, and persistence after refresh work')

  let snapshot = await model(smokeId),
    smoke = snapshot.components[0]
  await page.request.post(`${base}/api/projects/${smokeId}/changes`, {
    data: {
      baseRevision: snapshot.revision,
      source: 'agent',
      operations: [{ op: 'update_component', id: smoke.id, patch: { technology: 'Go' } }],
    },
  })
  await page
    .locator('[data-component-id] .node-technology')
    .getByText('Go', { exact: true })
    .waitFor()
  step('external agent edits appear without refreshing')
  await page.locator('[data-component-id]').click()
  await page
    .locator('.inspector-panel')
    .getByLabel('Name', { exact: true })
    .fill('Stale unsaved name')
  snapshot = await model(smokeId)
  await page.request.post(`${base}/api/projects/${smokeId}/changes`, {
    data: {
      baseRevision: snapshot.revision,
      source: 'agent',
      operations: [{ op: 'update_component', id: smoke.id, patch: { technology: 'Rust' } }],
    },
  })
  await page.getByText('The model changed while you were editing.', { exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: 'Save properties', exact: true }).isDisabled(),
    true,
  )
  assert.equal(
    await page.locator('.inspector-panel').getByLabel('Name', { exact: true }).inputValue(),
    'Stale unsaved name',
  )
  await page.getByRole('button', { name: 'Reload saved properties', exact: true }).click()
  assert.equal(
    await page.locator('.inspector-panel').getByLabel('Technology', { exact: true }).inputValue(),
    'Rust',
  )
  step('dirty property drafts are protected from concurrent agent edits')

  await closePanel()
  await page
    .locator('.project-link')
    .filter({ hasText: 'Commerce platform' })
    .filter({ hasNotText: 'imported' })
    .click()
  await expectNodes(10)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Fit architecture', exact: true }).click()
  await settleViewport()
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  )
  await page.screenshot({
    path: path.join(artifacts, 'archway-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  assert.ok((await page.locator('.sidebar').boundingBox())!.x >= 0)
  step('mobile layout and navigation remain usable without horizontal overflow')
  assert.deepEqual(errors, [])
  console.log('\nBrowser checks passed. Screenshots saved in artifacts/.')
} catch (error) {
  await page
    .screenshot({ path: path.join(artifacts, 'browser-failure.png'), fullPage: true })
    .catch(() => undefined)
  console.error('Browser errors:', errors)
  throw error
} finally {
  await context.close()
  await browser.close()
  if (mockProvider) await new Promise<void>((resolve) => mockProvider!.close(() => resolve()))
  await new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })
  assert.equal(path.dirname(dataDirectory), path.resolve(tmpdir()))
  assert.ok(path.basename(dataDirectory).startsWith('archway-browser-test-'))
  await rm(dataDirectory, { recursive: true, force: true })
}
