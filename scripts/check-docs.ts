import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const rootDocuments = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md']
async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await markdownFiles(target)))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target)
  }
  return files
}
const files = [
  ...rootDocuments.map((name) => path.join(root, name)),
  ...(await markdownFiles(path.join(root, 'docs'))),
  ...(await markdownFiles(path.join(root, '.github'))),
]
let failures = 0,
  checked = 0
for (const filename of files) {
  const content = (await readFile(filename, 'utf8'))
    .replace(/^\uFEFF/, '')
    .replace(/```[^\n]*\n[\s\S]*?```/g, '')
  const links = content.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g)
  for (const match of links) {
    const destination = match[1].replace(/^<|>$/g, '')
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(destination)) continue
    const local = decodeURIComponent(destination.split('#')[0].split('?')[0])
    if (!local) continue
    const target = path.resolve(path.dirname(filename), local)
    checked++
    if (!target.startsWith(path.resolve(root) + path.sep) && target !== path.resolve(root)) {
      console.error(`Outside repository: ${path.relative(root, filename)} → ${destination}`)
      failures++
      continue
    }
    try {
      await stat(target)
    } catch {
      console.error(`Missing destination: ${path.relative(root, filename)} → ${destination}`)
      failures++
    }
  }
}
if (failures) process.exitCode = 1
else
  console.log(
    `Documentation links OK: ${checked} local destinations in ${files.length} Markdown files. Heading anchors and remote URLs are not checked.`,
  )
