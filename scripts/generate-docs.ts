import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import { z } from 'zod'
import { ChangeRequestSchema, ProjectSchema, assertValid } from '../shared/model'
import { createProject } from '../shared/templates'

const root = fileURLToPath(new URL('../', import.meta.url))
const check = process.argv.includes('--check')
const config = (await resolveConfig(path.join(root, 'package.json'))) ?? {}
const project = createProject('commerce', undefined, 'example-commerce')
project.createdAt = '2026-11-04T00:00:00.000Z'
project.updatedAt = project.createdAt
assertValid(project)
const batch = ChangeRequestSchema.parse({
  baseRevision: 0,
  source: 'agent',
  message: 'Add a catalog read cache',
  operations: [
    {
      op: 'add_component',
      component: {
        id: 'catalog-cache',
        kind: 'database',
        name: 'Catalog cache',
        technology: 'Redis',
        description: 'A short-lived read cache; PostgreSQL remains the source of truth.',
        owner: 'Platform team',
        tags: ['cache', 'ephemeral'],
        boundaryId: 'data',
        metadata: { ttlSeconds: '60' },
      },
      position: { x: 1270, y: 10 },
    },
    {
      op: 'add_relationship',
      relationship: {
        id: 'catalog-to-cache',
        source: 'catalog-service',
        target: 'catalog-cache',
        label: 'Cache lookups',
        protocol: 'RESP',
        interaction: 'sync',
      },
    },
  ],
})
const documents: [string, unknown][] = [
  ['docs/reference/project.schema.json', z.toJSONSchema(ProjectSchema)],
  [
    'docs/reference/change-request.schema.json',
    z.toJSONSchema(ChangeRequestSchema, { io: 'input' }),
  ],
  ['docs/examples/commerce.project.json', project],
  ['docs/examples/add-cache.changes.json', batch],
]
let failures = 0
for (const [relativePath, value] of documents) {
  const target = path.resolve(root, relativePath)
  if (!target.startsWith(path.resolve(root) + path.sep))
    throw new Error('Invalid generated target.')
  const content = await format(JSON.stringify(value), { ...config, parser: 'json' })
  if (check) {
    let actual = ''
    try {
      actual = (await readFile(target, 'utf8')).replace(/^\uFEFF/, '')
    } catch {
      /* reported below */
    }
    if (actual !== content) {
      console.error(`Out of date: ${relativePath}`)
      failures++
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    console.log(`Generated ${relativePath}`)
  }
}
if (check && failures) {
  console.error('Run npm run docs:generate and review the generated diff.')
  process.exitCode = 1
} else if (check) console.log('Generated documentation is current.')
