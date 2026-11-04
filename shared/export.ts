import { diagramGeometry, NODE_HEIGHT, NODE_WIDTH } from './layout'
import type { ComponentKind, Project } from './model'

const COLORS: Record<ComponentKind, { background: string; foreground: string; label: string }> = {
  client: { background: '#e7edf5', foreground: '#557195', label: 'CLIENT' },
  gateway: { background: '#fbebd9', foreground: '#b47b35', label: 'GATEWAY' },
  service: { background: '#e4eeea', foreground: '#4f7b6a', label: 'SERVICE' },
  database: { background: '#ebe7f5', foreground: '#806aab', label: 'DATABASE' },
  queue: { background: '#f8e6d9', foreground: '#b57b52', label: 'QUEUE' },
  external: { background: '#f2e5eb', foreground: '#a46d89', label: 'EXTERNAL' },
}
const xml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  )
const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value
export function exportSvg(project: Project, viewId = project.views[0].id): string {
  const geometry = diagramGeometry(project, viewId)
  const minX =
    Math.min(
      0,
      ...geometry.components.map((c) => c.position.x),
      ...geometry.boundaries.map((b) => b.x),
    ) - 65
  const minY =
    Math.min(
      0,
      ...geometry.components.map((c) => c.position.y),
      ...geometry.boundaries.map((b) => b.y),
    ) - 110
  const maxX =
    Math.max(
      500,
      ...geometry.components.map((c) => c.position.x + NODE_WIDTH),
      ...geometry.boundaries.map((b) => b.x + b.width),
    ) + 65
  const maxY =
    Math.max(
      250,
      ...geometry.components.map((c) => c.position.y + NODE_HEIGHT),
      ...geometry.boundaries.map((b) => b.y + b.height),
    ) + 65
  const width = maxX - minX,
    height = maxY - minY
  const byId = new Map(geometry.components.map((c) => [c.component.id, c]))
  const boundaries = geometry.boundaries
    .map(
      (b) =>
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="14" fill="${b.boundary.type === 'trust' ? '#eeedf5' : '#eff2ed'}" fill-opacity=".6" stroke="#d8ddd7" stroke-dasharray="5 5"/><text x="${b.x + 17}" y="${b.y + 27}" font-size="10" font-weight="600" letter-spacing="1.1" fill="#79817d">${xml(b.boundary.name.toUpperCase())}</text>`,
    )
    .join('')
  const edges = project.relationships
    .flatMap((rel) => {
      const source = byId.get(rel.source),
        target = byId.get(rel.target)
      if (!source || !target) return []
      const x1 = source.position.x + NODE_WIDTH,
        y1 = source.position.y + NODE_HEIGHT / 2,
        x2 = target.position.x,
        y2 = target.position.y + NODE_HEIGHT / 2
      const middle = (x1 + x2) / 2,
        curve = Math.max(70, Math.abs(x2 - x1) / 2)
      const label = rel.protocol || rel.label
      return [
        `<path d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}" fill="none" stroke="#9da8a2" stroke-width="1.5" ${rel.interaction === 'async' ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>${label ? `<rect x="${middle - 34}" y="${(y1 + y2) / 2 - 11}" width="68" height="21" rx="6" fill="#f8f8f4"/><text x="${middle}" y="${(y1 + y2) / 2 + 3}" text-anchor="middle" font-size="9" fill="#6a746d">${xml(truncate(label, 13))}</text>` : ''}`,
      ]
    })
    .join('')
  const nodes = geometry.components
    .map(({ component, position }) => {
      const color = COLORS[component.kind]
      return `<g transform="translate(${position.x},${position.y})"><rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="12" fill="white" stroke="#dce1dc" filter="url(#shadow)"/><rect x="15" y="17" width="31" height="31" rx="9" fill="${color.background}"/><text x="30.5" y="37" text-anchor="middle" fill="${color.foreground}" font-size="15" font-weight="700">${color.label[0]}</text><text x="57" y="28" font-size="9" font-weight="600" letter-spacing="1" fill="${color.foreground}">${color.label}</text><text x="57" y="46" font-size="13" font-weight="600" fill="#273b33">${xml(truncate(component.name, 23))}</text><text x="16" y="76" font-size="11" fill="#7d8982">${xml(truncate(component.technology || 'Technology not specified', 30))}</text><path d="M 0 90 H ${NODE_WIDTH}" stroke="#eff1ed"/><circle cx="19" cy="105" r="3" fill="${color.foreground}"/><text x="29" y="109" font-size="9" fill="#8a938e">${xml(component.tags[0] || 'component')}</text><text x="${NODE_WIDTH - 15}" y="109" text-anchor="end" font-size="8" fill="#9ca39e">${xml(truncate(component.id, 22))}</text></g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${xml(project.name)}"><title>${xml(project.name)}</title><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="#d6dcd6"/></pattern><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#9da8a2"/></marker><filter id="shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#273b33" flood-opacity=".045"/></filter></defs><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f7f8f4"/><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#dots)"/><g font-family="Inter, Segoe UI, Arial, sans-serif"><text x="${minX + 35}" y="${minY + 40}" font-size="19" font-weight="600" fill="#273b33">${xml(project.name)}</text><text x="${minX + 35}" y="${minY + 61}" font-size="11" fill="#818c85">${xml(project.views.find((v) => v.id === viewId)?.name ?? 'System overview')} · Revision ${project.revision} · Archway</text>${boundaries}${edges}${nodes}</g></svg>`
}
export function exportMermaid(project: Project, viewId = project.views[0].id): string {
  const geometry = diagramGeometry(project, viewId),
    ids = new Map(geometry.components.map((c, index) => [c.component.id, `n${index}`]))
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/[\r\n]/g, ' ')
      .replace(/[\[\]{}|]/g, ' ')
  const lines = [
    'flowchart LR',
    `  %% ${escape(project.name)} — Archway revision ${project.revision}`,
  ]
  for (const { component } of geometry.components) {
    const text = `${escape(component.name)}${component.technology ? `<br/>${escape(component.technology)}` : ''}`
    lines.push(
      `  ${ids.get(component.id)}${component.kind === 'database' ? `[("${text}")]` : `["${text}"]`}`,
    )
  }
  for (const rel of project.relationships)
    if (ids.has(rel.source) && ids.has(rel.target))
      lines.push(
        `  ${ids.get(rel.source)} ${rel.interaction === 'async' ? '-.->' : '-->'}${rel.protocol || rel.label ? `|"${escape(rel.protocol || rel.label)}"|` : ''} ${ids.get(rel.target)}`,
      )
  for (const boundary of project.boundaries) {
    const members = geometry.components.filter((c) => c.component.boundaryId === boundary.id)
    if (members.length)
      lines.push(
        `  subgraph b${project.boundaries.indexOf(boundary)}["${escape(boundary.name)}"]`,
        ...members.map((c) => `    ${ids.get(c.component.id)}`),
        '  end',
      )
  }
  return `${lines.join('\n')}\n`
}
