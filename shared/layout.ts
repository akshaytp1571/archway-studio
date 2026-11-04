import dagre from '@dagrejs/dagre'
import { visibleComponents, type Project } from './model'

export const NODE_WIDTH = 222
export const NODE_HEIGHT = 118
export function autoLayout(project: Project, viewId: string, direction: 'LR' | 'TB' = 'LR') {
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 65, marginx: 60, marginy: 80 })
  graph.setDefaultEdgeLabel(() => ({}))
  const components = visibleComponents(project, viewId),
    ids = new Set(components.map((c) => c.id))
  for (const component of components)
    graph.setNode(component.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const rel of project.relationships)
    if (ids.has(rel.source) && ids.has(rel.target))
      graph.setEdge(rel.source, rel.target, {}, rel.id)
  dagre.layout(graph)
  return Object.fromEntries(
    components.map((component) => {
      const node = graph.node(component.id)
      return [
        component.id,
        { x: Math.round(node.x - NODE_WIDTH / 2), y: Math.round(node.y - NODE_HEIGHT / 2) },
      ]
    }),
  )
}
export function diagramGeometry(project: Project, viewId: string) {
  const view = project.views.find((v) => v.id === viewId) ?? project.views[0]
  const components = visibleComponents(project, viewId).map((component, index) => ({
    component,
    position: view.layout.positions[component.id] ?? { x: index * 290, y: 170 },
  }))
  const boundaries = project.boundaries.flatMap((boundary) => {
    const members = components.filter((c) => c.component.boundaryId === boundary.id)
    if (!members.length) return []
    const x = Math.min(...members.map((m) => m.position.x)) - 26,
      y = Math.min(...members.map((m) => m.position.y)) - 56
    return [
      {
        boundary,
        x,
        y,
        width: Math.max(...members.map((m) => m.position.x)) + NODE_WIDTH + 26 - x,
        height: Math.max(...members.map((m) => m.position.y)) + NODE_HEIGHT + 28 - y,
      },
    ]
  })
  return { components, boundaries }
}
