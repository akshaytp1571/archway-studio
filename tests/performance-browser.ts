import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createLargeProject } from '../shared/performance-fixture'
import { openBrowserFixture, saveMeasurements } from './browser-fixture'
const fixture = await openBrowserFixture('archway-performance-')
try {
  const response = await fixture.page.request.post(`${fixture.base}/api/projects`, {
    data: { import: createLargeProject() },
  })
  assert.equal(response.status(), 201)
  const { project } = await response.json()
  await fixture.page.addInitScript(
    (id) => localStorage.setItem('archway.activeProject', id),
    project.id,
  )
  const start = performance.now()
  await fixture.page.goto(fixture.base)
  await fixture.page.waitForFunction(
    () => document.querySelectorAll('.architecture-node').length === 500,
  )
  const renderMs = performance.now() - start
  await fixture.page.keyboard.press('Control+k')
  const search = fixture.page.getByRole('dialog', { name: 'Find your way around' })
  const searchStart = performance.now()
  await search.getByLabel('Search components').fill('component-250')
  await search.getByRole('option').first().waitFor()
  const searchMs = performance.now() - searchStart
  await search.getByLabel('Search components').press('Enter')
  await fixture.page
    .locator('.inspector-panel')
    .getByLabel('Name', { exact: true })
    .fill('Measured edit')
  const editStart = performance.now()
  await fixture.page.getByRole('button', { name: 'Save properties', exact: true }).click()
  await fixture.page
    .locator('.workspace-statusbar')
    .getByText('revision 1', { exact: true })
    .waitFor()
  const editMs = performance.now() - editStart
  assert.deepEqual(fixture.errors, [])
  const measurements = { components: 500, relationships: 1500, renderMs, searchMs, editMs }
  await saveMeasurements('performance-browser.json', measurements, fixture.webDist)
  console.log(JSON.stringify(measurements, null, 2))
} finally {
  await fixture.close()
}
