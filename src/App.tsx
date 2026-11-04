import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  Box,
  Braces,
  Cable,
  Check,
  ChevronRight,
  CircleCheck,
  Folder,
  History,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Redo2,
  Search,
  Settings2,
  Sparkles,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { autoLayout } from '../shared/layout'
import { visibleComponents, type ComponentKind } from '../shared/model'
import type { RecipeId } from '../shared/templates'
import { ArchitectureCanvas, type CanvasHandle, type Selection } from './Canvas'
import {
  AgentModal,
  ComponentModal,
  DeleteModal,
  ExportModal,
  NewProjectModal,
  ProjectDetailsModal,
  ProviderModal,
  RelationshipModal,
  SearchModal,
} from './Modals'
import {
  ActivityPanel,
  AssistantPanel,
  ComponentInspector,
  RelationshipInspector,
  type Proposal,
} from './Panels'
import { api, type ProviderState } from './api'
import { KINDS, KindIcon, Logo, kindEntries } from './ui'
import { useStudio } from './useStudio'

type Dialog =
  | { type: 'new' | 'export' | 'provider' | 'agent' | 'search' | 'details' | 'delete' }
  | { type: 'component'; kind?: ComponentKind }
  | { type: 'relationship'; source?: string; target?: string }
  | null
const defaultProvider: ProviderState = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  configured: false,
  hasApiKey: false,
  source: 'none',
}
export default function App() {
  const studio = useStudio(),
    project = studio.data?.project
  const [viewId, setViewId] = useState('overview'),
    [selection, setSelection] = useState<Selection>(null),
    [panel, setPanel] = useState<'assistant' | 'details' | 'activity' | null>('assistant')
  const [dialog, setDialog] = useState<Dialog>(null),
    [provider, setProvider] = useState<ProviderState | null>(null),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [planning, setPlanning] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState<{ message: string; kind: 'success' | 'error' } | null>(null)
  const canvas = useRef<CanvasHandle>(null),
    fileInput = useRef<HTMLInputElement>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    projectId = useRef<string | undefined>(undefined)
  projectId.current = project?.id
  const closeDialog = useCallback(() => setDialog(null), [])
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ message, kind })
    noticeTimer.current = setTimeout(() => setNotice(null), kind === 'error' ? 9000 : 4500)
  }, [])
  useEffect(() => {
    void api<ProviderState>('/api/settings/provider').then(setProvider).catch(studio.report)
  }, [studio.report])
  useEffect(() => {
    if (studio.error) notify(studio.error.message, 'error')
  }, [studio.error, notify])
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (!project) return
    const saved = localStorage.getItem(`archway.view.${project.id}`)
    setViewId(project.views.some((v) => v.id === saved) ? saved! : project.views[0].id)
    setSelection(null)
    setProposal(null)
  }, [project?.id])
  const select = useCallback((value: Selection) => {
    setSelection(value)
    if (value) setPanel('details')
    else setPanel((current) => (current === 'details' ? 'assistant' : current))
  }, [])
  const component =
    selection?.type === 'component'
      ? project?.components.find((c) => c.id === selection.id)
      : undefined
  const relationship =
    selection?.type === 'relationship'
      ? project?.relationships.find((r) => r.id === selection.id)
      : undefined
  const currentView = project?.views.find((v) => v.id === viewId) ?? project?.views[0]
  const blocked = studio.busy || planning || Boolean(proposal)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (project && !dialog && !blocked) setDialog({ type: 'search' })
        return
      }
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]') || dialog) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (!blocked && studio.data) {
          if (event.shiftKey && studio.data.canRedo)
            void studio.travel('redo').catch(() => undefined)
          else if (!event.shiftKey && studio.data.canUndo)
            void studio.travel('undo').catch(() => undefined)
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        if (!blocked && studio.data?.canRedo) void studio.travel('redo').catch(() => undefined)
      } else if (event.key.toLowerCase() === 'f') canvas.current?.fit()
      else if (event.key === 'Delete' && selection && !blocked) setDialog({ type: 'delete' })
      else if (event.key === 'Escape') {
        setSelection(null)
        setPanel((current) => (current === 'details' ? 'assistant' : current))
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [project, dialog, selection, blocked, studio.data, studio.travel])
  const openSettings = () => setDialog({ type: 'provider' })
  const plan = async (input: { prompt: string } | { recipeId: RecipeId }) => {
    if (!project || planning || studio.busy) return
    setPlanning(true)
    setPanel('assistant')
    setSelection(null)
    const id = project.id
    try {
      const value = await api<Proposal>('/api/assistant/plan', {
        method: 'POST',
        body: { projectId: id, baseRevision: project.revision, ...input },
      })
      if (projectId.current === id) setProposal(value)
    } catch (cause) {
      studio.report(cause)
    } finally {
      setPlanning(false)
    }
  }
  const applyProposal = async () => {
    if (!proposal) return
    try {
      await studio.commit(proposal.operations, {
        expectedRevision: proposal.baseRevision,
        source: proposal.mode === 'provider' ? 'agent' : 'human',
        message: `${proposal.mode === 'recipe' ? 'Recipe: ' : 'AI: '}${proposal.summary}`.slice(
          0,
          240,
        ),
      })
      setProposal(null)
      notify(`${proposal.operations.length} changes applied to your architecture`)
    } catch {
      /* useStudio reports the error and refreshes conflicts */
    }
  }
  const setView = (id: string) => {
    setViewId(id)
    if (project) localStorage.setItem(`archway.view.${project.id}`, id)
    setSelection(null)
  }
  const centerOn = (id: string) => {
    if (
      project &&
      currentView &&
      !visibleComponents(project, currentView.id).some((c) => c.id === id)
    )
      setView(project.views[0].id)
    select({ type: 'component', id })
    requestAnimationFrame(() => canvas.current?.centerOn(id))
  }
  const doLayout = async () => {
    if (!project || !currentView || blocked) return
    try {
      await studio.commit(
        [
          {
            op: 'set_layout',
            viewId: currentView.id,
            positions: autoLayout(project, currentView.id),
            direction: 'LR',
          },
        ],
        { message: 'Automatically arranged the architecture' },
      )
      requestAnimationFrame(() => canvas.current?.fit())
      notify('Architecture arranged')
    } catch {
      /* reported */
    }
  }
  const deleteSelection = async () => {
    if (!selection) return
    await studio.commit(
      selection.type === 'component'
        ? [{ op: 'remove_component', id: selection.id, cascade: true }]
        : [{ op: 'remove_relationship', id: selection.id }],
      { message: `Removed ${component?.name ?? relationship?.label ?? 'connection'}` },
    )
    select(null)
    notify('Removed. You can undo this change.')
  }
  if (!project || !studio.data || !currentView)
    return (
      <div className="startup-screen">
        <div className="startup-brand">
          <Logo />
          <strong>
            archway<span>Architecture studio</span>
          </strong>
        </div>
        {studio.loading ? (
          <>
            <LoaderCircle size={25} className="spin" />
            <h2>Making space for your ideas.</h2>
            <p>Loading your local architecture workspace…</p>
          </>
        ) : (
          <>
            <AlertCircle size={27} />
            <h2>We couldn’t open the workspace.</h2>
            <p>{studio.error?.message ?? 'Make sure the Archway server is running.'}</p>
            <button className="button primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </>
        )}
      </div>
    )
  const displayProject = proposal?.proposedProject ?? project
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <Logo />
          <div>
            <strong>
              archway<span className="brand-dot">.</span>
            </strong>
            <span>ARCHITECTURE STUDIO</span>
          </div>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Layers3 size={17} />
          </span>
          <div>
            <strong>Personal workspace</strong>
            <small>Local · Single-user</small>
          </div>
          <span className="local-dot" />
        </div>
        <div className="sidebar-scroll">
          <section className="sidebar-section">
            <div className="section-label">
              PROJECTS <span>{studio.projects.length}</span>
              <button
                aria-label="Create new project"
                title="Create new project"
                disabled={blocked}
                onClick={() => setDialog({ type: 'new' })}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="project-list">
              {studio.projects.map((item) => (
                <button
                  key={item.id}
                  className={`project-link ${item.id === project.id ? 'active' : ''}`}
                  disabled={blocked}
                  onClick={() => {
                    void studio.openProject(item.id)
                    setSidebarOpen(false)
                  }}
                >
                  <Folder size={15} />
                  <span>{item.name}</span>
                  <small>{item.componentCount}</small>
                </button>
              ))}
            </div>
            <button
              className="new-project-link"
              disabled={blocked}
              onClick={() => setDialog({ type: 'new' })}
            >
              <Plus size={14} />
              New project
            </button>
          </section>
          <section className="sidebar-section views-section">
            <div className="section-label">
              VIEWS <span>{project.views.length}</span>
            </div>
            {project.views.map((view, index) => (
              <button
                key={view.id}
                className={`view-link ${currentView.id === view.id ? 'active' : ''}`}
                disabled={Boolean(proposal)}
                onClick={() => setView(view.id)}
              >
                {index === 0 ? (
                  <Network size={15} />
                ) : index === 1 ? (
                  <Box size={15} />
                ) : (
                  <Cable size={15} />
                )}
                <span>{view.name}</span>
                {currentView.id === view.id && <i />}
              </button>
            ))}
          </section>
          <section className="sidebar-section library-section">
            <div className="section-label">
              COMPONENT LIBRARY <span>6</span>
            </div>
            <p className="library-instruction">Drag onto the canvas, or click to add.</p>
            <div className="component-library">
              {kindEntries.map(([kind, info]) => (
                <button
                  key={kind}
                  className="library-item"
                  disabled={blocked}
                  draggable={!blocked}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/archway-kind', kind)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => setDialog({ type: 'component', kind })}
                >
                  <KindIcon kind={kind} size={15} />
                  <span>{info.label}</span>
                  <Plus size={12} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="sidebar-bottom">
          <button className="agent-card" onClick={() => setDialog({ type: 'agent' })}>
            <span className="agent-card-icon">
              <Braces size={22} />
            </span>
            <strong>Agents welcome.</strong>
            <p>
              A model they can read.
              <br />
              Tools they can trust.
            </p>
            <span className="agent-card-action">
              Explore the agent API <ArrowRight size={13} />
            </span>
            <i className="agent-card-orbit" />
          </button>
          <div className="sidebar-footer">
            <span>
              <i className="local-dot" />
              Local workspace
            </span>
            <button
              aria-label="Import architecture JSON"
              title="Import architecture JSON"
              disabled={blocked}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={15} />
            </button>
            <button aria-label="Provider settings" title="Provider settings" onClick={openSettings}>
              <Settings2 size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-workspace">
        <header className="workspace-topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <Layers3 size={16} />
            <span>Personal workspace</span>
            <ChevronRight size={13} />
            <strong>{project.name}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              disabled={blocked}
              onClick={() => setDialog({ type: 'search' })}
            >
              <Search size={15} />
              <span>Quick find</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button settings-trigger"
              onClick={openSettings}
              aria-label="Configure model provider"
              title="Configure model provider"
            >
              <Settings2 size={17} />
            </button>
            <span className="workspace-avatar" title="Local single-user workspace">
              Y
            </span>
          </div>
        </header>
        <section className="project-header">
          <div className="project-heading">
            <div className="project-title-row">
              <span className="project-symbol">
                <Network size={23} strokeWidth={1.6} />
              </span>
              <button
                className="project-name-button"
                onClick={() => setDialog({ type: 'details' })}
                disabled={blocked}
              >
                <h1>{project.name}</h1>
                <Pencil size={13} />
              </button>
              <span className="model-valid-badge">
                <CircleCheck size={12} />
                Model valid
              </span>
            </div>
            <p>{project.description}</p>
          </div>
          <div className="project-actions">
            <div className="history-buttons">
              <button
                className="icon-button"
                disabled={!studio.data.canUndo || blocked}
                onClick={() => void studio.travel('undo').catch(() => undefined)}
                title="Undo · Ctrl Z"
                aria-label="Undo change"
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                disabled={!studio.data.canRedo || blocked}
                onClick={() => void studio.travel('redo').catch(() => undefined)}
                title="Redo · Ctrl Shift Z"
                aria-label="Redo change"
              >
                <Redo2 size={17} />
              </button>
            </div>
            <span className="toolbar-divider" />
            <button
              className="button compact"
              disabled={blocked || !project.components.length}
              onClick={() => void doLayout()}
            >
              <LayoutGrid size={15} />
              <span>Auto layout</span>
            </button>
            <button className="button compact" onClick={() => setDialog({ type: 'export' })}>
              <ArrowDownToLine size={15} />
              <span>Export</span>
            </button>
            <button
              className="button primary compact"
              disabled={blocked}
              onClick={() => setDialog({ type: 'component' })}
            >
              <Plus size={16} />
              <span>Component</span>
            </button>
          </div>
        </section>
        <div className="workspace-meta">
          <div>
            <span className="workspace-meta-label">DESIGN CANVAS</span>
            <span className="meta-dot" />
            <span>{project.components.length} components</span>
            <span className="meta-dot" />
            <span>{project.relationships.length} connections</span>
          </div>
          <div>
            <button
              className="connection-trigger"
              disabled={blocked || project.components.length < 2}
              onClick={() => setDialog({ type: 'relationship' })}
            >
              <Cable size={14} />
              Connect
            </button>
            <span className="toolbar-divider" />
            <button
              className={`panel-trigger ${panel === 'assistant' ? 'active' : ''}`}
              onClick={() => {
                setPanel((current) => (current === 'assistant' ? null : 'assistant'))
                setSelection(null)
              }}
            >
              <Sparkles size={14} />
              Assistant
            </button>
            <button
              className={`icon-button ${panel === 'activity' ? 'active' : ''}`}
              aria-label="Open change history"
              title="Change history"
              onClick={() => {
                setPanel((current) => (current === 'activity' ? null : 'activity'))
                setSelection(null)
              }}
            >
              <History size={16} />
            </button>
          </div>
        </div>
        <div className={`editor-area ${panel ? 'with-panel' : ''}`}>
          <ArchitectureCanvas
            ref={canvas}
            project={displayProject}
            original={project}
            viewId={currentView.id}
            selection={selection}
            preview={Boolean(proposal)}
            changeCount={proposal?.operations.length ?? 0}
            disabled={studio.busy || planning}
            onSelect={select}
            onView={setView}
            onConnect={(connection) =>
              setDialog({
                type: 'relationship',
                source: connection.source,
                target: connection.target,
              })
            }
            onAdd={() => setDialog({ type: 'component' })}
            onTemplates={() => setDialog({ type: 'new' })}
            onDiscard={() => setProposal(null)}
            commit={studio.commit}
          />
          {panel === 'assistant' && (
            <AssistantPanel
              project={project}
              proposal={proposal}
              planning={planning}
              busy={studio.busy}
              config={provider}
              onClose={() => setPanel(null)}
              onSettings={openSettings}
              onPlan={(input) => void plan(input)}
              onApply={() => void applyProposal()}
              onDiscard={() => setProposal(null)}
            />
          )}
          {panel === 'details' && component && (
            <ComponentInspector
              key={component.id}
              component={component}
              project={project}
              busy={studio.busy}
              commit={studio.commit}
              onClose={() => {
                setPanel(null)
                setSelection(null)
              }}
              onDelete={() => setDialog({ type: 'delete' })}
              onSelect={centerOn}
              notify={notify}
            />
          )}
          {panel === 'details' && relationship && (
            <RelationshipInspector
              key={relationship.id}
              relationship={relationship}
              project={project}
              busy={studio.busy}
              commit={studio.commit}
              onClose={() => {
                setPanel(null)
                setSelection(null)
              }}
              onDelete={() => setDialog({ type: 'delete' })}
            />
          )}
          {panel === 'activity' && (
            <ActivityPanel
              history={studio.data.history}
              revision={project.revision}
              onClose={() => setPanel(null)}
            />
          )}
          {studio.loading && (
            <div className="editor-loading">
              <LoaderCircle size={23} className="spin" />
              <span>Opening architecture…</span>
            </div>
          )}
        </div>
        <footer className="workspace-statusbar">
          <div>
            {studio.busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}
            <span>{studio.busy ? 'Saving changes…' : 'Changes saved locally'}</span>
            {studio.data.validation.warnings.length > 0 && (
              <span className="warning-count">
                {studio.data.validation.warnings.length} advisory warning
                {studio.data.validation.warnings.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div>
            <button onClick={() => setDialog({ type: 'agent' })}>
              <span className="live-dot" />
              Agent API ready
              <Braces size={12} />
            </button>
            <span className="status-separator" />
            <code>schema v1</code>
            <span className="status-separator" />
            <code>revision {project.revision}</code>
          </div>
        </footer>
      </main>
      <input
        ref={fileInput}
        className="hidden-input"
        type="file"
        accept=".json,application/json"
        aria-label="Import architecture file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file)
            void studio
              .importFile(file)
              .then(() => {
                setDialog(null)
                notify('Architecture imported as a new project')
              })
              .catch(() => undefined)
        }}
      />
      {notice && (
        <div className={`toast ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.kind === 'error' ? <AlertCircle size={18} /> : <CircleCheck size={18} />}
          <span>{notice.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setNotice(null)
              studio.dismissError()
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog?.type === 'new' && (
        <NewProjectModal
          onClose={closeDialog}
          onCreate={(template, name) =>
            studio.create(template, name).then((value) => {
              notify('Your new architecture is ready')
              return value
            })
          }
        />
      )}
      {dialog?.type === 'component' && (
        <ComponentModal
          project={project}
          initialKind={dialog.kind}
          onClose={closeDialog}
          commit={studio.commit}
          onCreated={(id) => select({ type: 'component', id })}
        />
      )}
      {dialog?.type === 'relationship' && (
        <RelationshipModal
          project={project}
          source={dialog.source}
          target={dialog.target}
          onClose={closeDialog}
          commit={studio.commit}
        />
      )}
      {dialog?.type === 'export' && (
        <ExportModal
          project={project}
          viewId={currentView.id}
          onClose={closeDialog}
          onImport={() => fileInput.current?.click()}
          notify={notify}
        />
      )}
      {dialog?.type === 'provider' && (
        <ProviderModal
          config={provider ?? defaultProvider}
          onClose={closeDialog}
          onSave={(value) => {
            setProvider(value)
            notify('Provider settings saved. The connection is used when you generate a proposal.')
          }}
        />
      )}
      {dialog?.type === 'agent' && (
        <AgentModal project={project} onClose={closeDialog} notify={notify} />
      )}
      {dialog?.type === 'search' && (
        <SearchModal project={project} onClose={closeDialog} onSelect={centerOn} />
      )}
      {dialog?.type === 'details' && (
        <ProjectDetailsModal project={project} onClose={closeDialog} commit={studio.commit} />
      )}
      {dialog?.type === 'delete' && selection && (
        <DeleteModal
          name={component?.name ?? relationship?.label ?? 'this connection'}
          connections={
            component
              ? project.relationships.filter(
                  (r) => r.source === component.id || r.target === component.id,
                ).length
              : 0
          }
          onClose={closeDialog}
          onDelete={deleteSelection}
        />
      )}
    </div>
  )
}
