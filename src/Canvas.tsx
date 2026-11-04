import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import {
  Check,
  ChevronDown,
  Frame,
  Hand,
  Layers3,
  Map,
  Minus,
  MousePointer2,
  Plus,
  Scan,
  SquareDashed,
  Tag,
  X,
} from 'lucide-react'
import { diagramGeometry, NODE_HEIGHT, NODE_WIDTH } from '../shared/layout'
import {
  ComponentKindSchema,
  ComponentSchema,
  type Boundary,
  type Component,
  type Operation,
  type Project,
} from '../shared/model'
import { EmptyIllustration, KINDS, KindIcon } from './ui'
import type { CommitOptions } from './useStudio'

export type Selection = { type: 'component' | 'relationship'; id: string } | null
export type CanvasHandle = { fit: () => void; centerOn: (id: string) => void }
type NodeData = {
  component?: Component
  boundary?: Boundary
  direction: 'LR' | 'TB'
  change?: 'added' | 'updated'
  dimmed?: boolean
}
type DiagramNode = Node<NodeData, 'architecture' | 'boundary'>
type Props = {
  project: Project
  original: Project
  viewId: string
  selection: Selection
  preview: boolean
  changeCount: number
  disabled: boolean
  onSelect: (selection: Selection) => void
  onView: (id: string) => void
  onConnect: (connection: Connection) => void
  onAdd: () => void
  onTemplates: () => void
  onDiscard: () => void
  commit: (operations: Operation[], options?: CommitOptions) => Promise<unknown>
}

const ArchitectureNode = memo(function ArchitectureNode({
  data,
  selected,
}: NodeProps<DiagramNode>) {
  const component = data.component!,
    kind = KINDS[component.kind]
  const horizontal = data.direction === 'LR'
  return (
    <div
      className={`architecture-node ${selected ? 'is-selected' : ''} ${data.change ? `change-${data.change}` : ''} ${data.dimmed ? 'is-dimmed' : ''}`}
      data-component-id={component.id}
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        id="input"
        aria-label={`Connect to ${component.name}`}
      />
      {data.change && (
        <span className={`node-change-label ${data.change}`}>
          {data.change === 'added' ? '+ New' : 'Updated'}
        </span>
      )}
      <div className="node-heading">
        <KindIcon kind={component.kind} size={18} />
        <div>
          <span className={`node-kind ${kind.color}`}>{kind.label}</span>
          <strong title={component.name}>{component.name}</strong>
        </div>
      </div>
      <div className="node-technology">
        <span>{component.technology || 'Add a technology'}</span>
        <span className="node-port-dot" />
      </div>
      <div className="node-footer">
        <span>
          <i className={`tiny-dot ${kind.color}`} />
          {component.tags[0] || 'component'}
        </span>
        <code title={component.id}>{component.id}</code>
      </div>
      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        id="output"
        aria-label={`Connect from ${component.name}`}
      />
    </div>
  )
})
const BoundaryNode = memo(function BoundaryNode({ data }: NodeProps<DiagramNode>) {
  const boundary = data.boundary!
  return (
    <div className={`boundary-node ${boundary.type}`}>
      <span>
        <SquareDashed size={12} />
        {boundary.name}
        <small>
          {boundary.type === 'trust'
            ? 'TRUST BOUNDARY'
            : boundary.type === 'network'
              ? 'NETWORK'
              : 'SYSTEM'}
        </small>
      </span>
    </div>
  )
})
const nodeTypes = { architecture: ArchitectureNode, boundary: BoundaryNode }
const emptyProjectLabel = 'A little clarity goes a long way.'

const CanvasInner = forwardRef<CanvasHandle, Props>(function CanvasInner(props, ref) {
  const { project, original, viewId, selection, preview, disabled, onSelect, onConnect, commit } =
    props
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([])
  const [showBoundaries, setShowBoundaries] = useState(true),
    [showLabels, setShowLabels] = useState(true),
    [showMap, setShowMap] = useState(false),
    [panMode, setPanMode] = useState(false),
    [zoom, setZoom] = useState(100)
  const flow = useReactFlow<DiagramNode>(),
    initialized = useNodesInitialized(),
    lastFit = useRef('')
  const view = project.views.find((v) => v.id === viewId) ?? project.views[0]
  const geometry = useMemo(() => diagramGeometry(project, view.id), [project, view.id])
  const originalIds = useMemo(() => new Set(original.components.map((c) => c.id)), [original])
  const updatedIds = useMemo(
    () =>
      new Set(
        project.components
          .filter(
            (c) =>
              originalIds.has(c.id) &&
              JSON.stringify(c) !==
                JSON.stringify(original.components.find((item) => item.id === c.id)),
          )
          .map((c) => c.id),
      ),
    [original, project, originalIds],
  )
  useEffect(() => {
    const boundaryNodes: DiagramNode[] = showBoundaries
      ? geometry.boundaries.map((b) => ({
          id: `boundary:${b.boundary.id}`,
          type: 'boundary',
          data: { boundary: b.boundary, direction: view.layout.direction },
          position: { x: b.x, y: b.y },
          style: { width: b.width, height: b.height },
          zIndex: -1,
          selectable: false,
          draggable: false,
          focusable: false,
          connectable: false,
        }))
      : []
    const componentNodes: DiagramNode[] = geometry.components.map(({ component, position }) => {
      const change = preview
        ? !originalIds.has(component.id)
          ? 'added'
          : updatedIds.has(component.id)
            ? 'updated'
            : undefined
        : undefined
      return {
        id: component.id,
        type: 'architecture',
        data: { component, direction: view.layout.direction, change, dimmed: preview && !change },
        position,
        selected: selection?.type === 'component' && selection.id === component.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        draggable: !disabled && !preview,
        connectable: !disabled && !preview,
        zIndex: 1,
      }
    })
    setNodes([...boundaryNodes, ...componentNodes])
  }, [
    geometry,
    showBoundaries,
    view.layout.direction,
    selection,
    preview,
    disabled,
    originalIds,
    updatedIds,
    setNodes,
  ])
  const edges: Edge[] = useMemo(() => {
    const visible = new Set(geometry.components.map((c) => c.component.id))
    return project.relationships
      .filter((r) => visible.has(r.source) && visible.has(r.target))
      .map((rel) => {
        const added = preview && !original.relationships.some((r) => r.id === rel.id),
          selected = selection?.type === 'relationship' && selection.id === rel.id
        const color = selected ? '#d36946' : added ? '#54947c' : '#a4aea6'
        return {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          sourceHandle: 'output',
          targetHandle: 'input',
          type: 'smoothstep',
          selected,
          animated: false,
          label: showLabels ? rel.protocol || rel.label : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color },
          style: {
            stroke: color,
            strokeWidth: selected || added ? 1.8 : 1.4,
            strokeDasharray: rel.interaction === 'async' ? '5 4' : undefined,
            opacity: preview && !added ? 0.5 : 1,
          },
          labelStyle: { fill: '#778079', fontSize: 10, fontFamily: 'inherit', fontWeight: 450 },
          labelBgStyle: { fill: '#f5f6f1', fillOpacity: 0.98 },
          labelBgPadding: [7, 4] as [number, number],
          labelBgBorderRadius: 5,
          interactionWidth: 22,
          zIndex: 0,
        }
      })
  }, [project, original, geometry, preview, selection, showLabels])
  const fit = () => {
    void flow.fitView({ padding: 0.17, maxZoom: 1, duration: 350 })
  }
  useImperativeHandle(ref, () => ({
    fit,
    centerOn: (id) => {
      const node = flow.getNode(id)
      if (node)
        void flow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
          zoom: 1,
          duration: 400,
        })
    },
  }))
  useEffect(() => {
    const key = `${project.id}:${view.id}:${geometry.components.length}:${preview}`
    if (initialized && key !== lastFit.current) {
      lastFit.current = key
      void flow.fitView({ padding: 0.17, maxZoom: 1, duration: lastFit.current ? 250 : 0 })
    }
  }, [initialized, project.id, view.id, geometry.components.length, preview, flow])
  return (
    <div className={`canvas-shell ${preview ? 'is-previewing' : ''}`}>
      <div className="canvas-topbar">
        <label className="view-switcher">
          <Layers3 size={15} />
          <select
            aria-label="Architecture view"
            value={view.id}
            disabled={preview}
            onChange={(event) => props.onView(event.target.value)}
          >
            {project.views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>
        <span className="toolbar-divider" />
        <button
          className={`canvas-option ${showBoundaries ? 'active' : ''}`}
          onClick={() => setShowBoundaries((v) => !v)}
          title="Show or hide system boundaries"
        >
          <SquareDashed size={14} />
          <span>Boundaries</span>
        </button>
        <button
          className={`canvas-option icon-only ${showLabels ? 'active' : ''}`}
          aria-label="Toggle connection labels"
          title="Toggle connection labels"
          onClick={() => setShowLabels((v) => !v)}
        >
          <Tag size={14} />
        </button>
        <span className="canvas-node-count">{geometry.components.length} components</span>
      </div>
      {preview && (
        <div className="preview-banner">
          <span>
            <Scan size={15} />
            Previewing {props.changeCount} changes <small>Nothing saved yet</small>
          </span>
          <button onClick={props.onDiscard} title="Discard proposal" aria-label="Discard proposal">
            <X size={15} />
          </button>
        </div>
      )}
      <ReactFlow<DiagramNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => {
          if (node.type === 'architecture' && !preview) onSelect({ type: 'component', id: node.id })
        }}
        onEdgeClick={(_event, edge) => {
          if (!preview) onSelect({ type: 'relationship', id: edge.id })
        }}
        onPaneClick={() => {
          if (!preview) onSelect(null)
        }}
        onNodeDragStop={(_event, node, draggedNodes) => {
          if (disabled || preview) return
          const positions = Object.fromEntries(
            (draggedNodes.length ? draggedNodes : [node])
              .filter((n) => n.type === 'architecture')
              .map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]),
          )
          if (Object.keys(positions).length)
            void commit([{ op: 'set_layout', viewId: view.id, positions }], {
              message: 'Moved components on the canvas',
            }).catch(() => undefined)
        }}
        onConnect={(connection) => {
          if (!disabled && !preview) onConnect(connection)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (disabled || preview) return
          const parsed = ComponentKindSchema.safeParse(
            event.dataTransfer.getData('application/archway-kind'),
          )
          if (!parsed.success) return
          const kind = parsed.data,
            position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          const boundary = geometry.boundaries.find(
            (b) =>
              position.x > b.x &&
              position.x < b.x + b.width &&
              position.y > b.y &&
              position.y < b.y + b.height,
          )
          const component = ComponentSchema.parse({
            id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
            kind,
            name: `New ${KINDS[kind].label.toLowerCase()}`,
            technology: KINDS[kind].technology,
            boundaryId: boundary?.boundary.id ?? null,
          })
          void commit([{ op: 'add_component', component, position }], {
            message: `Added ${component.name}`,
          })
            .then(() => onSelect({ type: 'component', id: component.id }))
            .catch(() => undefined)
        }}
        onMove={(_event, viewport) => setZoom(Math.round(viewport.zoom * 100))}
        minZoom={0.2}
        maxZoom={1.7}
        fitView
        fitViewOptions={{ padding: 0.17, maxZoom: 1 }}
        nodesDraggable={!disabled && !preview}
        nodesConnectable={!disabled && !preview}
        edgesFocusable={!preview}
        panOnDrag={panMode ? true : [1, 2]}
        selectionOnDrag={!panMode && !preview}
        selectNodesOnDrag={!panMode}
        deleteKeyCode={null}
        snapToGrid={false}
        elevateEdgesOnSelect
        proOptions={{ hideAttribution: true }}
        className={panMode ? 'pan-mode' : 'select-mode'}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#dbe1d9" />
        {showMap && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={(node) => {
              const kind = (node.data as NodeData).component?.kind
              return kind
                ? {
                    client: '#a7bad0',
                    gateway: '#dfbc88',
                    service: '#93b8a6',
                    database: '#b6a6ce',
                    queue: '#d8b08e',
                    external: '#cda9ba',
                  }[kind]
                : '#e8ebe4'
            }}
            nodeStrokeWidth={0}
            maskColor="rgba(244,246,241,.7)"
          />
        )}
      </ReactFlow>
      {!geometry.components.length && (
        <div className="canvas-empty">
          <EmptyIllustration />
          <span className="eyebrow">YOUR NEXT GREAT SYSTEM</span>
          <h2>{emptyProjectLabel}</h2>
          <p>
            Add a component, start with a template, or describe
            <br />
            your idea to a connected architecture assistant.
          </p>
          <div>
            <button className="button primary" onClick={props.onAdd}>
              <Plus size={16} />
              Add first component
            </button>
            <button className="button" onClick={props.onTemplates}>
              Explore templates
            </button>
          </div>
          <small>Tip: drag a component from the library onto the canvas</small>
        </div>
      )}
      <div className="canvas-legend">
        <span>
          <i className="tiny-dot green" />
          Application
        </span>
        <span>
          <i className="tiny-dot purple" />
          Data
        </span>
        <span>
          <i className="tiny-dot pink" />
          External
        </span>
      </div>
      <div className="canvas-controls">
        <button
          className={!panMode ? 'active' : ''}
          aria-label="Selection tool"
          title="Selection tool"
          onClick={() => setPanMode(false)}
        >
          <MousePointer2 size={17} />
        </button>
        <button
          className={panMode ? 'active' : ''}
          aria-label="Pan tool"
          title="Pan tool · hold Space or use middle mouse"
          onClick={() => setPanMode(true)}
        >
          <Hand size={17} />
        </button>
        <i />
        <button
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => void flow.zoomOut({ duration: 150 })}
        >
          <Minus size={16} />
        </button>
        <span>{zoom}%</span>
        <button
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => void flow.zoomIn({ duration: 150 })}
        >
          <Plus size={16} />
        </button>
        <i />
        <button aria-label="Fit architecture" title="Fit architecture · F" onClick={fit}>
          <Frame size={17} />
        </button>
        <button
          className={showMap ? 'active' : ''}
          aria-label="Toggle minimap"
          title="Toggle minimap"
          onClick={() => setShowMap((v) => !v)}
        >
          <Map size={16} />
        </button>
      </div>
      <div className="canvas-hint">
        <Check size={12} />
        <span>{preview ? 'Validated proposal' : 'One model. Every view.'}</span>
      </div>
    </div>
  )
})
export const ArchitectureCanvas = forwardRef<CanvasHandle, Props>(
  function ArchitectureCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <CanvasInner {...props} ref={ref} />
      </ReactFlowProvider>
    )
  },
)
