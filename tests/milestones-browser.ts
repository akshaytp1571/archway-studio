import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Project } from '../shared/model'
import { openBrowserFixture } from './browser-fixture'
const fixture = await openBrowserFixture('archway-milestone-browser-'),
  { page, base } = fixture
const current = async (): Promise<Project> =>
  (await (await page.request.get(`${base}/api/projects/milestone-project`)).json()).project
const waitRevision = async (revision: number) =>
  page.locator('.workspace-statusbar').getByText(`revision ${revision}`, { exact: true }).waitFor()
const tools = async (name: string) => {
  const menu = page.locator('.project-tools')
  if ((await menu.getAttribute('open')) === null)
    await page.getByLabel('Project tools', { exact: true }).click()
  await menu.getByRole('button', { name, exact: true }).click()
}
const mock = createServer(async (req, res) => {
  for await (const _chunk of req) {
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))
})
await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve))
try {
  await page.goto(base)
  await waitRevision(0)
  await page.getByLabel('Manage views', { exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Views', exact: true })
  await dialog.getByRole('button', { name: 'New view', exact: true }).click()
  await dialog.getByLabel('View name', { exact: true }).fill('Services review')
  await dialog.getByRole('button', { name: 'Service', exact: true }).click()
  await dialog.getByRole('button', { name: 'Create view', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await waitRevision(1)
  let project = await current()
  let view = project.views.find((item) => item.name === 'Services review')!
  assert.deepEqual(view.kinds, ['service'])
  const layout = structuredClone(view.layout)
  await page.getByLabel('Manage views', { exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Views', exact: true })
  await dialog.getByLabel('View name', { exact: true }).fill('Renamed review')
  await dialog.getByRole('button', { name: 'Save view', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await waitRevision(2)
  project = await current()
  assert.deepEqual(project.views.find((item) => item.id === view.id)?.layout, layout)
  console.log('PASS visual create/update views preserve IDs and layout')
  await tools('Manage boundaries')
  dialog = page.getByRole('dialog', { name: 'Boundaries', exact: true })
  await dialog.getByRole('button', { name: 'New boundary', exact: true }).click()
  await dialog.getByLabel('Boundary name', { exact: true }).fill('Review boundary')
  await dialog.getByRole('checkbox', { name: /Order service/ }).check()
  await dialog.getByRole('button', { name: 'Create boundary', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await waitRevision(3)
  project = await current()
  const boundary = project.boundaries.find((item) => item.name === 'Review boundary')!
  assert.equal(
    project.components.find((item) => item.id === 'order-service')?.boundaryId,
    boundary.id,
  )
  console.log('PASS boundary creation and membership use one revision')
  await tools('Snapshots and backups')
  dialog = page.getByRole('dialog', { name: 'Recover a local snapshot', exact: true })
  await dialog.getByLabel('Snapshot name', { exact: true }).fill('Before inventory')
  await dialog.getByRole('button', { name: 'Save snapshot at revision 3', exact: true }).click()
  await dialog.getByRole('button', { name: /Before inventory Â· revision 3/ }).waitFor()
  assert.equal((await current()).revision, 3)
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download canonical JSON', exact: true }).click()
  const download = await downloadPromise
  assert.ok(download.suggestedFilename().endsWith('.json'))
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.request.post(`${base}/api/projects/milestone-project/changes`, {
    data: {
      baseRevision: 3,
      operations: [{ op: 'update_project', patch: { name: 'Edited after snapshot' } }],
    },
  })
  await waitRevision(4)
  await tools('Snapshots and backups')
  dialog = page.getByRole('dialog', { name: 'Recover a local snapshot', exact: true })
  await dialog.getByRole('button', { name: 'Preview restore', exact: true }).click()
  await dialog.getByRole('checkbox', { name: /I reviewed this preview/ }).check()
  await dialog.getByRole('button', { name: 'Restore reviewed snapshot', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await waitRevision(5)
  assert.equal((await current()).name, 'Milestone fixture')
  console.log('PASS snapshot capture is read-only and restore advances revision')
  await tools('Discover from local inventory')
  dialog = page.getByRole('dialog', { name: 'Discover from local inventory', exact: true })
  await dialog.getByLabel('Inventory JSON file').setInputFiles({
    name: 'inventory.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        inventoryVersion: 1,
        components: [{ id: 'browser-inventory', kind: 'service', name: 'Browser inventory' }],
      }),
    ),
  })
  await dialog.getByRole('button', { name: 'Preview inventory', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review inventory proposal', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('region', { name: 'Semantic proposal diff' }).waitFor()
  assert.equal((await current()).revision, 5)
  await page
    .locator('.assistant-panel')
    .getByRole('button', { name: 'Discard proposal', exact: true })
    .click()
  assert.equal((await current()).revision, 5)
  await tools('Discover from local inventory')
  dialog = page.getByRole('dialog', { name: 'Discover from local inventory', exact: true })
  await dialog.getByLabel('Inventory JSON file').setInputFiles({
    name: 'inventory.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        inventoryVersion: 1,
        components: [{ id: 'browser-inventory', kind: 'service', name: 'Browser inventory' }],
      }),
    ),
  })
  await dialog.getByRole('button', { name: 'Preview inventory', exact: true }).click()
  await dialog.getByRole('button', { name: 'Review inventory proposal', exact: true }).click()
  await page
    .locator('.assistant-panel')
    .getByRole('button', { name: 'Apply 1 change', exact: true })
    .click()
  await waitRevision(6)
  assert.ok((await current()).components.some((item) => item.id === 'browser-inventory'))
  console.log('PASS inventory diff preview/discard are read-only and apply is explicit')
  await page.keyboard.press('Control+k')
  dialog = page.getByRole('dialog', { name: 'Find your way around', exact: true })
  await dialog.getByLabel('Search components').fill('browser-inventory')
  await dialog.getByLabel('Search components').press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.locator('.inspector-panel').getByLabel('Name', { exact: true }).waitFor()
  assert.equal(
    await page.locator('.inspector-panel').getByLabel('Name', { exact: true }).inputValue(),
    'Browser inventory',
  )
  await page.keyboard.press('Control+k')
  dialog = page.getByRole('dialog', { name: 'Find your way around', exact: true })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  console.log('PASS keyboard-only search and Escape navigation')
  await fixture.providers.save({
    baseUrl: `http://127.0.0.1:${(mock.address() as { port: number }).port}/v1`,
    model: 'browser-test-model',
    apiKey: 'dummy-key',
  })
  await page.getByLabel('Provider settings', { exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Connect your architecture assistant', exact: true })
  await dialog.getByRole('button', { name: 'Test saved connection', exact: true }).click()
  await dialog.getByText(/Connected to browser-test-model in/).waitFor()
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  assert.equal((await current()).revision, 6)
  // Refresh provider state, then intercept a delayed planning response and cancel it explicitly.
  await page.reload()
  await waitRevision(6)
  if (!(await page.locator('.assistant-panel').count()))
    await page.getByRole('button', { name: 'Assistant', exact: true }).click()
  let received!: () => void
  const started = new Promise<void>((resolve) => (received = resolve))
  await page.route('**/api/assistant/plan', async (route) => {
    received()
    await new Promise<void>((resolve) => setTimeout(resolve, 150))
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: 'Late result',
          operations: [],
          mode: 'provider',
          proposedProject: await current(),
          validation: { valid: true, warnings: [], errors: [] },
          baseRevision: 6,
        }),
      })
      .catch(() => undefined)
  })
  await page
    .getByLabel('Describe an architecture change', { exact: true })
    .fill('Cancel this proposal')
  await page.getByRole('button', { name: 'Generate a proposal', exact: true }).click()
  await started
  await page.getByRole('button', { name: 'Cancel generation', exact: true }).click()
  await page.getByText('Generation cancelled. No changes were saved.', { exact: true }).waitFor()
  assert.equal((await current()).revision, 6)
  assert.equal(await page.getByText('Review proposal', { exact: true }).count(), 0)
  console.log('PASS real saved connection test and cancelled planning do not change model')
  assert.deepEqual(fixture.errors, [])
} catch (error) {
  await page
    .screenshot({ path: 'artifacts/milestone-failure.png', fullPage: true })
    .catch(() => undefined)
  throw error
} finally {
  mock.closeAllConnections()
  await new Promise<void>((resolve) => mock.close(() => resolve()))
  await fixture.close()
}
