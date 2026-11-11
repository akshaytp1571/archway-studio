import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cpus, platform, arch } from 'node:os'
import { performance } from 'node:perf_hooks'
import { applyOperations, validateArchitecture } from '../shared/model'
import { createLargeProject } from '../shared/performance-fixture'
import { diffProjects } from '../shared/diff'
import { searchComponents } from '../shared/search'
const project = createLargeProject(),
  iterations = 20
const after = applyOperations(project, [
  { op: 'update_component', id: 'component-250', patch: { technology: 'Rust' } },
])
const timings: Record<string, { meanMs: number; minMs: number; maxMs: number }> = {}
for (const [name, fn] of [
  ['validate', () => validateArchitecture(project)],
  [
    'atomicEdit',
    () =>
      applyOperations(project, [
        { op: 'update_component', id: 'component-250', patch: { technology: 'Rust' } },
      ]),
  ],
  ['semanticDiff', () => diffProjects(project, after)],
  ['search', () => searchComponents(project, 'group-5')],
] as const) {
  fn()
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  timings[name] = {
    meanMs: samples.reduce((a, b) => a + b, 0) / iterations,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
  }
}
const root = path.resolve('artifacts'),
  output = path.resolve(process.argv[2] ?? 'artifacts/performance.json')
if (!output.startsWith(root + path.sep))
  throw new Error('Benchmark output must be inside the ignored artifacts directory.')
await mkdir(path.dirname(output), { recursive: true })
const result = {
  fixture: { components: 500, relationships: 1500, synthetic: true },
  conditions: {
    node: process.version,
    platform: platform(),
    architecture: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    iterations,
    build: 'Node TypeScript via tsx',
  },
  timings,
}
await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(result, null, 2))
console.log(`Measurements saved to ${output}; no timing thresholds or production-scale guarantee.`)
