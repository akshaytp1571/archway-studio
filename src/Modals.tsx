import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FileJson,
  Image,
  Layers3,
  LoaderCircle,
  Network,
  Plug,
  Search,
  ShieldCheck,
  Terminal,
  Upload,
  X,
} from 'lucide-react'
import {
  ComponentSchema,
  RelationshipSchema,
  type ComponentKind,
  type Operation,
  type Project,
} from '../shared/model'
import { TEMPLATE_CATALOG, type TemplateId } from '../shared/templates'
import { normalizeProviderBaseUrl } from '../shared/provider-settings'
import { api, downloadExport, type ProviderState } from './api'
import { EmptyIllustration, KINDS, KindIcon, kindEntries } from './ui'
import type { CommitOptions } from './useStudio'
import { ProviderConnectionTest } from './ProviderConnectionTest'
import { searchComponents } from '../shared/search'

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  busy?: boolean
}) {
  const dialog = useRef<HTMLElement>(null),
    previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement
    const frame = requestAnimationFrame(() => {
      const input =
        dialog.current?.querySelector<HTMLElement>('[autofocus]') ??
        dialog.current?.querySelector<HTMLElement>('input, textarea, select') ??
        dialog.current?.querySelector<HTMLElement>('button')
      input?.focus()
    })
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        onClose()
      }
      if (event.key === 'Tab') {
        const elements = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
          ) ?? [],
        ).filter((element) => element.offsetParent !== null)
        const first = elements[0],
          last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', key)
      previousFocus.current?.focus()
    }
  }, [onClose, busy])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        ref={dialog}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  const id = useId()
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { id, 'aria-label': label })
    : children
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {control}
    </label>
  )
}
export function FormError({ error }: { error: string }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null
}
export function NewProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (template: TemplateId, name: string) => Promise<unknown>
}) {
  const [template, setTemplate] = useState<TemplateId>('blank'),
    [name, setName] = useState('My architecture'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title="Make room for a great idea."
      subtitle="Choose a starting point. Every template is a real, editable model."
      onClose={onClose}
      wide
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            await onCreate(template, name.trim())
            onClose()
          } catch (cause) {
            setError((cause as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="modal-body">
          <Field label="Project name">
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name your architecture"
            />
          </Field>
          <div className="template-grid">
            {TEMPLATE_CATALOG.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`template-card ${template === item.id ? 'selected' : ''}`}
                onClick={() => setTemplate(item.id)}
              >
                <div className={`template-preview ${item.id}`}>
                  {item.id === 'blank' ? (
                    <PlusGrid />
                  ) : (
                    <>
                      <span className="mini-node blue" />
                      <i />
                      <span className="mini-node green" />
                      <div className="mini-stack">
                        <span className="mini-node green" />
                        <span className="mini-node purple" />
                        <span className="mini-node peach" />
                      </div>
                    </>
                  )}
                  {template === item.id && (
                    <span className="template-check">
                      <Check size={13} />
                    </span>
                  )}
                </div>
                <span className="eyebrow">{item.category}</span>
                <strong>{item.name}</strong>
                <p>{item.description}</p>
                <small>
                  {item.components
                    ? `${item.components} components · 3 views`
                    : 'Your ideas, no constraints'}
                </small>
              </button>
            ))}
          </div>
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <span>
            <ShieldCheck size={14} />
            Saved on this computer
          </span>
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}Create
            project
          </button>
        </footer>
      </form>
    </Modal>
  )
}
function PlusGrid() {
  return (
    <span className="blank-template-plus">
      <Network size={32} strokeWidth={1.2} />
    </span>
  )
}
export function ComponentModal({
  project,
  initialKind = 'service',
  onClose,
  commit,
  onCreated,
}: {
  project: Project
  initialKind?: ComponentKind
  onClose: () => void
  commit: (operations: Operation[], options?: CommitOptions) => Promise<unknown>
  onCreated: (id: string) => void
}) {
  const [kind, setKind] = useState(initialKind),
    [name, setName] = useState(''),
    [technology, setTechnology] = useState(KINDS[initialKind].technology),
    [description, setDescription] = useState(''),
    [boundaryId, setBoundaryId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title="Add a component"
      subtitle="Give your system a new building block."
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            const slug =
              name
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 65) || kind
            const component = ComponentSchema.parse({
              id: `${slug}-${crypto.randomUUID().slice(0, 6)}`,
              kind,
              name,
              technology,
              description,
              boundaryId: boundaryId || null,
            })
            await commit([{ op: 'add_component', component }], {
              message: `Added ${component.name}`,
            })
            onCreated(component.id)
            onClose()
          } catch (cause) {
            setError((cause as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="modal-body">
          <div className="kind-picker">
            {kindEntries.map(([value, info]) => (
              <button
                type="button"
                key={value}
                className={kind === value ? 'selected' : ''}
                onClick={() => {
                  setKind(value)
                  setTechnology(info.technology)
                }}
              >
                <KindIcon kind={value} size={17} />
                {info.label}
                {kind === value && <Check size={12} />}
              </button>
            ))}
          </div>
          <Field label="Name">
            <input
              autoFocus
              required
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder={`e.g. ${kind === 'service' ? 'Notification service' : kind === 'database' ? 'Orders database' : KINDS[kind].label}`}
            />
          </Field>
          <div className="field-row">
            <Field label="Technology">
              <input
                value={technology}
                maxLength={100}
                onChange={(event) => setTechnology(event.target.value)}
                placeholder="Language, framework, or platform"
              />
            </Field>
            <Field label="Boundary">
              <select value={boundaryId} onChange={(event) => setBoundaryId(event.target.value)}>
                <option value="">Outside a boundary</option>
                {project.boundaries.map((boundary) => (
                  <option key={boundary.id} value={boundary.id}>
                    {boundary.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Description" hint="optional">
            <textarea
              rows={3}
              value={description}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What responsibility does this component own?"
            />
          </Field>
          <div className="info-note">
            <Braces size={16} />
            <span>
              A stable ID is created once. Agents use it to address this component, even after you
              rename it.
            </span>
          </div>
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}Add
            component
          </button>
        </footer>
      </form>
    </Modal>
  )
}
export function RelationshipModal({
  project,
  source = '',
  target = '',
  onClose,
  commit,
}: {
  project: Project
  source?: string
  target?: string
  onClose: () => void
  commit: (operations: Operation[], options?: CommitOptions) => Promise<unknown>
}) {
  const [from, setFrom] = useState(source),
    [to, setTo] = useState(target),
    [label, setLabel] = useState(''),
    [protocol, setProtocol] = useState('HTTPS'),
    [interaction, setInteraction] = useState<'sync' | 'async'>('sync'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title="Connect the dots"
      subtitle="Relationships describe how your components work together."
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            const relationship = RelationshipSchema.parse({
              id: `link-${crypto.randomUUID().slice(0, 10)}`,
              source: from,
              target: to,
              label,
              protocol,
              interaction,
            })
            await commit([{ op: 'add_relationship', relationship }], {
              message: `Connected ${from} to ${to}`,
            })
            onClose()
          } catch (cause) {
            setError((cause as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="modal-body">
          <div className="connection-fields">
            <Field label="From">
              <select required value={from} onChange={(event) => setFrom(event.target.value)}>
                <option value="">Select a component</option>
                {project.components.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <ArrowRight size={18} />
            <Field label="To">
              <select required value={to} onChange={(event) => setTo(event.target.value)}>
                <option value="">Select a component</option>
                {project.components.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Relationship">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Publishes order events"
              maxLength={100}
            />
          </Field>
          <div className="field-row">
            <Field label="Protocol">
              <input
                value={protocol}
                maxLength={60}
                onChange={(event) => setProtocol(event.target.value)}
                placeholder="HTTPS, SQL, AMQP…"
              />
            </Field>
            <Field label="Interaction">
              <select
                value={interaction}
                onChange={(event) => setInteraction(event.target.value as 'sync' | 'async')}
              >
                <option value="sync">Synchronous</option>
                <option value="async">Asynchronous</option>
              </select>
            </Field>
          </div>
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !from || !to}>
            Create connection
          </button>
        </footer>
      </form>
    </Modal>
  )
}
export function ExportModal({
  project,
  viewId,
  onClose,
  onImport,
  notify,
}: {
  project: Project
  viewId: string
  onClose: () => void
  onImport: () => void
  notify: (message: string) => void
}) {
  const [error, setError] = useState('')
  const formats = [
    {
      id: 'json' as const,
      title: 'Architecture model',
      text: 'Canonical JSON. All components, relationships, and views. Lossless and agent-ready.',
      icon: FileJson,
      tag: 'JSON',
    },
    {
      id: 'svg' as const,
      title: 'Vector diagram',
      text: 'A crisp, portable image of the current view. Perfect for documents and presentations.',
      icon: Image,
      tag: 'SVG',
    },
    {
      id: 'mermaid' as const,
      title: 'Diagram as text',
      text: 'A Mermaid rendering of this view. Easy to include in Markdown and repositories.',
      icon: Code2,
      tag: 'MMD',
    },
  ]
  return (
    <Modal
      title="Take your architecture with you."
      subtitle="Models are portable. Images and diagram text are view-only exports."
      onClose={onClose}
    >
      <div className="modal-body export-list">
        {formats.map((format) => (
          <button
            key={format.id}
            className="export-card"
            onClick={async () => {
              try {
                await downloadExport(project, viewId, format.id)
                notify(`${format.tag} export downloaded`)
              } catch (cause) {
                setError((cause as Error).message)
              }
            }}
          >
            <span className="export-icon">
              <format.icon size={22} />
            </span>
            <span>
              <strong>{format.title}</strong>
              <p>{format.text}</p>
            </span>
            <small>{format.tag}</small>
            <ArrowDownToLine size={17} />
          </button>
        ))}
        <FormError error={error} />
        <div className="info-note">
          <BookOpen size={16} />
          <span>
            Import an Archway JSON export to create an independent copy. SVG and Mermaid are not
            round-trip architecture formats.
          </span>
        </div>
      </div>
      <footer className="modal-footer">
        <button className="button text" onClick={onImport}>
          <Upload size={15} />
          Import JSON
        </button>
        <button
          className="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(project, null, 2))
              notify('Canonical model copied')
            } catch {
              setError('Clipboard access was denied. Download JSON instead.')
            }
          }}
        >
          <Copy size={15} />
          Copy model
        </button>
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </Modal>
  )
}
export function ProviderModal({
  config,
  onClose,
  onSave,
}: {
  config: ProviderState
  onClose: () => void
  onSave: (config: ProviderState) => void
}) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl),
    [model, setModel] = useState(config.model),
    [key, setKey] = useState(''),
    [clearKey, setClearKey] = useState(false),
    [reuseApiKey, setReuseApiKey] = useState(false),
    [enabled, setEnabled] = useState<boolean>(config.source === 'none' ? true : config.configured),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const endpointChanged =
      normalizeProviderBaseUrl(baseUrl) !== normalizeProviderBaseUrl(config.baseUrl),
    needsReuseConsent =
      config.hasApiKey && !key && !clearKey && (config.source === 'environment' || endpointChanged)
  return (
    <Modal
      title="Connect your architecture assistant"
      subtitle="Use an OpenAI-compatible hosted or local model."
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            if (needsReuseConsent && !reuseApiKey) {
              setError(
                'Confirm reusing the existing key for this endpoint, or enter a new key or clear it.',
              )
              setBusy(false)
              return
            }
            const saved = await api<ProviderState>('/api/settings/provider', {
              method: 'PUT',
              body: {
                baseUrl,
                model,
                enabled,
                ...(key !== '' ? { apiKey: key } : clearKey ? { apiKey: '' } : {}),
                ...(reuseApiKey ? { reuseApiKey: true } : {}),
              },
            })
            onSave(saved)
            onClose()
          } catch (cause) {
            setError((cause as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="modal-body">
          <div className="provider-heading">
            <span>
              <Plug size={22} />
            </span>
            <div>
              <strong>Your model. Your architecture.</strong>
              <p>Requests run on the server, never directly from the browser.</p>
            </div>
          </div>
          <Field label="API base URL">
            <input
              autoFocus
              type="url"
              required
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value)
                setReuseApiKey(false)
                setError('')
              }}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="Model">
            <input
              required
              value={model}
              maxLength={150}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-4.1-mini or your local model name"
            />
          </Field>
          <Field label="API key" hint="optional for local models">
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={
                config.hasApiKey
                  ? config.source === 'environment'
                    ? 'Provided by environment — not shown'
                    : 'A key is saved locally — leave blank to keep it'
                  : 'Enter your provider key'
              }
            />
          </Field>
          {config.hasApiKey && (
            <>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(event) => {
                    setClearKey(event.target.checked)
                    if (event.target.checked) setReuseApiKey(false)
                  }}
                />
                Clear the {config.source === 'environment' ? 'environment-provided' : 'saved'} key
              </label>
              {needsReuseConsent && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={reuseApiKey}
                    onChange={(event) => setReuseApiKey(event.target.checked)}
                  />
                  {config.source === 'environment'
                    ? 'I explicitly consent to copying the environment key into local plaintext settings for this endpoint'
                    : 'I explicitly consent to reusing the saved key at this different endpoint'}
                </label>
              )}
            </>
          )}
          {config.source === 'environment' && config.hasApiKey && (
            <p className="info-note" role="note">
              The active key comes from the server environment and is never returned to this
              browser. Reusing it copies it into the local plaintext settings file.
            </p>
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable prompt-driven architecture editing
          </label>
          <div className="info-note">
            <ShieldCheck size={16} />
            <span>
              The key is not returned by the API. Settings are stored locally in a plain JSON file;
              this MVP is not a hosted secrets vault. Only the built-in recipes work without a
              model.
            </span>
          </div>
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Plug size={16} />}Save provider
          </button>
        </footer>
      </form>
      <ProviderConnectionTest disabled={busy} />
    </Modal>
  )
}
export function AgentModal({
  project,
  onClose,
  notify,
}: {
  project: Project
  onClose: () => void
  notify: (message: string) => void
}) {
  const [tab, setTab] = useState<'mcp' | 'rest' | 'model'>('mcp')
  const origin = window.location.origin
  const request = {
    baseRevision: project.revision,
    source: 'agent',
    message: 'Add a read cache',
    operations: [
      {
        op: 'add_component',
        component: {
          id: 'agent-read-cache',
          kind: 'database',
          name: 'Read cache',
          technology: 'Redis',
        },
      },
    ],
  }
  const config = JSON.stringify(
    { mcpServers: { archway: { type: 'http', url: `${origin}/mcp` } } },
    null,
    2,
  )
  const text =
    tab === 'mcp'
      ? config
      : tab === 'model'
        ? JSON.stringify(project, null, 2)
        : JSON.stringify(request, null, 2)
  const tools = [
    ['list_projects', 'Discover project IDs and revisions'],
    ['get_architecture', 'Read the canonical architecture'],
    ['get_model_schema', 'Understand the document and operation schemas'],
    ['preview_changes', 'Validate without saving'],
    ['apply_changes', 'Commit an atomic, revision-checked batch'],
    ['analyze_impact', 'Trace dependencies before changing a component'],
  ]
  return (
    <Modal
      title="An architecture agents can work with."
      subtitle="Typed components. Stable IDs. Real tools, not screenshots."
      onClose={onClose}
      wide
    >
      <div className="modal-tabs">
        {(['mcp', 'rest', 'model'] as const).map((value) => (
          <button
            className={tab === value ? 'active' : ''}
            key={value}
            onClick={() => setTab(value)}
          >
            {value === 'mcp' ? (
              <Plug size={15} />
            ) : value === 'rest' ? (
              <Terminal size={15} />
            ) : (
              <Braces size={15} />
            )}
            {value === 'mcp'
              ? 'MCP connection'
              : value === 'rest'
                ? 'REST transactions'
                : 'Live model'}
          </button>
        ))}
      </div>
      <div className="modal-body agent-docs">
        {tab === 'mcp' ? (
          <>
            <p className="docs-intro">
              Connect a client that supports <strong>Streamable HTTP</strong>. This is an example
              configuration; exact syntax varies by client.
            </p>
            <div className="endpoint-bar">
              <span className="live-dot" />
              <code>{origin}/mcp</code>
              <small>6 tools</small>
            </div>
          </>
        ) : tab === 'rest' ? (
          <>
            <p className="docs-intro">
              Read the current revision, preview a batch, then apply the same batch. Stale edits
              return <code>409 REVISION_CONFLICT</code>.
            </p>
            <div className="endpoint-bar">
              <small className="method">POST</small>
              <code>/api/projects/{project.id}/changes/preview</code>
            </div>
            <div className="endpoint-bar">
              <small className="method">POST</small>
              <code>/api/projects/{project.id}/changes</code>
            </div>
          </>
        ) : (
          <p className="docs-intro">
            This is the saved source of truth at <strong>revision {project.revision}</strong>.
            Visual positions belong to views, not component semantics.
          </p>
        )}
        <div className="code-box">
          <div>
            <span>
              {tab === 'mcp'
                ? 'Example client configuration'
                : tab === 'rest'
                  ? 'Change request'
                  : 'Canonical architecture JSON'}
            </span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text)
                  notify('Copied to clipboard')
                } catch {
                  notify('Clipboard unavailable — use JSON export')
                }
              }}
            >
              <Copy size={13} />
              Copy
            </button>
          </div>
          <pre>{text}</pre>
        </div>
        {tab === 'mcp' && (
          <div className="tool-grid">
            {tools.map(([name, description]) => (
              <div key={name}>
                <code>{name}</code>
                <span>{description}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'rest' && (
          <div className="info-note">
            <Braces size={16} />
            <span>
              GET /api/schema exposes JSON schemas. GET /api/projects/{project.id}/context provides
              the model and editing capabilities.
            </span>
          </div>
        )}
        <div className="local-warning">
          <ShieldCheck size={15} />
          <span>
            Local-only server. No user authentication. Do not expose it publicly before adding
            authentication and project permissions.
          </span>
        </div>
      </div>
      <footer className="modal-footer">
        <span>Schema version 1 · Revision {project.revision}</span>
        <button className="button primary" onClick={onClose}>
          Got it
        </button>
      </footer>
    </Modal>
  )
}
export function SearchModal({
  project,
  onClose,
  onSelect,
}: {
  project: Project
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState(''),
    [active, setActive] = useState(0)
  const listId = useId(),
    matches = searchComponents(project, query)
  const choose = (id: string) => {
    onSelect(id)
    onClose()
  }
  const selected = Math.min(active, Math.max(0, matches.length - 1))
  return (
    <Modal
      title="Find your way around"
      subtitle="Search by name, technology, type, stable ID, owner, or tags."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="search-input">
          <Search size={18} />
          <input
            autoFocus
            role="combobox"
            aria-label="Search components"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={matches[selected] ? `${listId}-${selected}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            placeholder="Search components…"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((value) => (value + 1) % Math.max(1, matches.length))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((value) => (value + matches.length - 1) % Math.max(1, matches.length))
              } else if (event.key === 'Enter' && matches[selected]) {
                event.preventDefault()
                choose(matches[selected].id)
              }
            }}
          />
        </div>
        <p role="status" aria-live="polite">
          {matches.length} results. Use arrow keys and Enter, or Tab to a result.
        </p>
        <div
          className="search-results"
          id={listId}
          role="listbox"
          aria-label="Component search results"
        >
          {matches.map((component, index) => (
            <button
              role="option"
              aria-selected={selected === index}
              id={`${listId}-${index}`}
              key={component.id}
              onFocus={() => setActive(index)}
              onClick={() => choose(component.id)}
            >
              <KindIcon kind={component.kind} />
              <span>
                <strong>{component.name}</strong>
                <small>
                  {component.technology} · {component.id}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        {!matches.length && (
          <div className="small-empty" role="status">
            <Search size={24} />
            <p>No components found.</p>
            <small>Try another name, technology, owner, or tag.</small>
          </div>
        )}
      </div>
    </Modal>
  )
}
export function ProjectDetailsModal({
  project,
  onClose,
  commit,
}: {
  project: Project
  onClose: () => void
  commit: (operations: Operation[], options?: CommitOptions) => Promise<unknown>
}) {
  const [name, setName] = useState(project.name),
    [description, setDescription] = useState(project.description),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title="Project details"
      subtitle="A clear name helps everyone find the right system."
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            await commit([{ op: 'update_project', patch: { name, description } }], {
              message: 'Updated project details',
              expectedRevision: project.revision,
            })
            onClose()
          } catch (cause) {
            setError((cause as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="modal-body">
          <Field label="Name">
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              value={description}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="stable-id">
            <Braces size={14} />
            <code>{project.id}</code>
          </div>
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            Save details
          </button>
        </footer>
      </form>
    </Modal>
  )
}
export function DeleteModal({
  name,
  connections,
  onClose,
  onDelete,
}: {
  name: string
  connections: number
  onClose: () => void
  onDelete: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <Modal
      title={`Remove ${name}?`}
      subtitle="Keep your architecture intentional."
      onClose={onClose}
      busy={busy}
    >
      <div className="modal-body">
        <p className="delete-description">
          {connections
            ? `This also removes ${connections} connected relationship${connections === 1 ? '' : 's'} and the component's positions from every view.`
            : 'This removes the selected item from your architecture.'}{' '}
          You can undo this change.
        </p>
        <FormError error={error} />
      </div>
      <footer className="modal-footer">
        <button className="button" disabled={busy} onClick={onClose}>
          Keep it
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onDelete()
              onClose()
            } catch (cause) {
              setError((cause as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy && <LoaderCircle size={15} className="spin" />}Remove
        </button>
      </footer>
    </Modal>
  )
}
