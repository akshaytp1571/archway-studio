import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  History,
  LoaderCircle,
  Network,
  Plug,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react'
import {
  analyzeImpact,
  describeOperation,
  type ChangeEvent,
  type Component,
  type Operation,
  type Project,
  type Relationship,
  type ValidationReport,
} from '../shared/model'
import { RECIPES, type RecipeId } from '../shared/templates'
import type { ProviderState } from './api'
import { Field, FormError } from './Modals'
import { KINDS, KindIcon, kindEntries, timeAgo } from './ui'
import type { CommitOptions } from './useStudio'
import { ProposalDiff } from './ProposalDiff'
import type { InventoryReport } from '../shared/inventory'

export type Proposal = {
  summary: string
  operations: Operation[]
  mode: 'recipe' | 'provider' | 'inventory'
  report?: InventoryReport
  model?: string
  proposedProject: Project
  validation: ValidationReport
  baseRevision: number
}
export function PanelHeader({
  title,
  icon,
  onClose,
}: {
  title: string
  icon: React.ReactNode
  onClose: () => void
}) {
  return (
    <header className="panel-header">
      <span>
        {icon}
        <strong>{title}</strong>
      </span>
      <button className="icon-button" aria-label="Close side panel" onClick={onClose}>
        <X size={16} />
      </button>
    </header>
  )
}
export function AssistantPanel({
  project,
  proposal,
  planning,
  busy,
  config,
  onClose,
  onSettings,
  onPlan,
  onApply,
  onDiscard,
  onCancel,
}: {
  project: Project
  proposal: Proposal | null
  planning: boolean
  busy: boolean
  config: ProviderState | null
  onClose: () => void
  onSettings: () => void
  onPlan: (input: { prompt: string } | { recipeId: RecipeId }) => void
  onApply: () => void
  onDiscard: () => void
  onCancel?: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const stale = Boolean(proposal && proposal.baseRevision !== project.revision)
  const additions = proposal?.operations.filter((op) => op.op === 'add_component').length ?? 0,
    connections = proposal?.operations.filter((op) => op.op === 'add_relationship').length ?? 0
  return (
    <aside className="side-panel assistant-panel">
      <PanelHeader
        title={proposal ? 'Review proposal' : 'Architecture assistant'}
        icon={<Sparkles size={16} />}
        onClose={onClose}
      />
      {proposal ? (
        <>
          <div className="panel-scroll proposal-content">
            <span className={`mode-pill ${proposal.mode}`}>
              <span className="live-dot" />
              {proposal.mode === 'recipe'
                ? 'Built-in recipe'
                : proposal.mode === 'inventory'
                  ? 'Local inventory'
                  : proposal.model || 'Connected model'}
            </span>
            <div className="proposal-hero">
              <span>
                <Network size={25} strokeWidth={1.5} />
              </span>
              <h3>
                A clearer system,
                <br />
                one change at a time.
              </h3>
              <p>{proposal.summary}</p>
            </div>
            <div className="proposal-metrics">
              <div>
                <strong>+{additions}</strong>
                <span>components</span>
              </div>
              <div>
                <strong>+{connections}</strong>
                <span>connections</span>
              </div>
              <div>
                <strong>{proposal.operations.length}</strong>
                <span>total changes</span>
              </div>
            </div>
            <div className="section-label">
              PROPOSED CHANGES <span>{proposal.operations.length}</span>
            </div>
            <div className="proposal-list">
              {proposal.operations.map((operation, index) => (
                <div key={index}>
                  <span
                    className={`operation-dot ${operation.op.startsWith('remove') ? 'remove' : ''}`}
                  >
                    {operation.op.startsWith('remove')
                      ? '−'
                      : operation.op.startsWith('add')
                        ? '+'
                        : '↻'}
                  </span>
                  <div>
                    <strong>{describeOperation(operation)}</strong>
                    <small>
                      {operation.op === 'add_component'
                        ? `${KINDS[operation.component.kind].label} · ${operation.component.technology || 'Unspecified technology'}`
                        : operation.op === 'add_relationship'
                          ? `${operation.relationship.protocol || 'Connection'} · ${operation.relationship.interaction === 'async' ? 'Asynchronous' : 'Synchronous'}`
                          : operation.op.replace(/_/g, ' ')}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <ProposalDiff
              before={project}
              after={proposal.proposedProject}
              validation={proposal.validation}
            />
            <div className="validation-card">
              <CircleCheck size={17} />
              <span>
                <strong>Schema & references validated</strong>
                <small>
                  {proposal.validation.warnings.length
                    ? `${proposal.validation.warnings.length} advisory warning${proposal.validation.warnings.length === 1 ? '' : 's'}`
                    : 'Every component and connection checks out.'}
                </small>
              </span>
            </div>
            {proposal.validation.warnings.map((warning) => (
              <p className="advisory" key={warning.path}>
                {warning.message}
              </p>
            ))}
            {stale && (
              <div className="form-error">
                The saved model has changed. Discard this proposal and regenerate it against the
                latest revision.
              </div>
            )}
          </div>
          <footer className="proposal-footer">
            <p>
              <Braces size={13} />
              Preview only. Nothing has been saved.
            </p>
            <button className="button primary full" disabled={busy || stale} onClick={onApply}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Apply{' '}
              {proposal.operations.length} {proposal.operations.length === 1 ? 'change' : 'changes'}
            </button>
            <button className="button text full" disabled={busy} onClick={onDiscard}>
              Discard proposal
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="panel-scroll assistant-content">
            <div className="assistant-hero">
              <div className="assistant-orbit" aria-hidden="true">
                <i />
                <span>
                  <Sparkles size={25} strokeWidth={1.5} />
                </span>
                <b />
                <em />
              </div>
              <span className="eyebrow">FROM IDEA TO ARCHITECTURE</span>
              <h3>
                Think in systems.
                <br />
                Build with clarity.
              </h3>
              <p>
                Describe a change. Review the model.
                <br />
                Keep every connection intentional.
              </p>
            </div>
            <div className={`provider-status ${config?.configured ? 'connected' : ''}`}>
              <span className={config?.configured ? 'live-dot' : 'status-ring'} />
              <span>
                <strong>{config?.configured ? config.model : 'No model connected'}</strong>
                <small>
                  {config?.configured
                    ? 'OpenAI-compatible provider configured'
                    : 'Recipes are available without an LLM'}
                </small>
              </span>
              <button
                onClick={onSettings}
                title="Configure model provider"
                aria-label="Configure model provider"
              >
                <Plug size={15} />
              </button>
            </div>
            <form
              className="prompt-composer"
              onSubmit={(event) => {
                event.preventDefault()
                if (config?.configured && prompt.trim().length >= 3)
                  onPlan({ prompt: prompt.trim() })
                else onSettings()
              }}
            >
              <textarea
                aria-label="Describe an architecture change"
                rows={4}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={planning}
                placeholder="Add a notification service that consumes order events from a queue…"
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === 'Enter' &&
                    config?.configured &&
                    prompt.trim().length >= 3
                  ) {
                    event.preventDefault()
                    onPlan({ prompt: prompt.trim() })
                  }
                }}
              />
              <div>
                <span>
                  {planning ? 'Validating a proposed model…' : 'Changes are previewed first'}
                </span>
                <button
                  className="prompt-send"
                  type="submit"
                  disabled={planning || busy || (config?.configured && prompt.trim().length < 3)}
                  title={config?.configured ? 'Generate a proposal' : 'Connect a model'}
                  aria-label={config?.configured ? 'Generate a proposal' : 'Connect a model'}
                >
                  {planning ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              </div>
            </form>
            {planning && onCancel && (
              <button className="button" onClick={onCancel}>
                Cancel generation
              </button>
            )}
            <div className="section-label">
              TRY A BUILT-IN RECIPE <span>NO LLM</span>
            </div>
            <div className="recipe-list">
              {RECIPES.map((recipe) => (
                <button
                  key={recipe.id}
                  disabled={
                    planning || busy || !project.components.some((c) => c.kind === 'service')
                  }
                  onClick={() => onPlan({ recipeId: recipe.id })}
                >
                  <KindIcon kind={recipe.icon as 'queue' | 'database' | 'external'} size={16} />
                  <span>
                    <strong>{recipe.title}</strong>
                    <small>{recipe.description}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
            {!project.components.some((c) => c.kind === 'service') && (
              <p className="recipe-help">
                Add a service or start from a template to use recipes. A connected model can also
                build from a blank canvas.
              </p>
            )}
            <div className="assistant-principle">
              <Braces size={17} />
              <div>
                <strong>More than a picture.</strong>
                <p>
                  Your assistant works with the same typed model as the canvas—not a screenshot.
                </p>
              </div>
            </div>
          </div>
          <footer className="assistant-footer">
            <ShieldMark />
            Stable IDs · Validated changes · Undo history
          </footer>
        </>
      )}
    </aside>
  )
}
function ShieldMark() {
  return <CircleCheck size={13} />
}
export function ComponentInspector({
  component,
  project,
  busy,
  commit,
  onClose,
  onDelete,
  onSelect,
  notify,
}: {
  component: Component
  project: Project
  busy: boolean
  commit: (operations: Operation[], options?: CommitOptions) => Promise<unknown>
  onClose: () => void
  onDelete: () => void
  onSelect: (id: string) => void
  notify: (message: string) => void
}) {
  const [draft, setDraft] = useState(component),
    [tags, setTags] = useState(component.tags.join(', ')),
    [baseRevision, setBaseRevision] = useState(project.revision),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState<'properties' | 'impact'>('properties'),
    [error, setError] = useState('')
  const stale = dirty && baseRevision !== project.revision
  useEffect(() => {
    if (!dirty) {
      setDraft(component)
      setTags(component.tags.join(', '))
      setBaseRevision(project.revision)
    }
  }, [component, project.revision, dirty])
  const update = <K extends keyof Component>(key: K, value: Component[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setError('')
  }
  const impact = useMemo(() => analyzeImpact(project, component.id), [project, component.id])
  return (
    <aside className="side-panel inspector-panel">
      <PanelHeader title="Component details" icon={<Network size={16} />} onClose={onClose} />
      <div className="inspector-identity">
        <KindIcon kind={component.kind} size={23} />
        <div>
          <span className="eyebrow">{KINDS[component.kind].label}</span>
          <h3>{component.name}</h3>
        </div>
      </div>
      <div className="panel-tabs">
        <button
          className={tab === 'properties' ? 'active' : ''}
          onClick={() => setTab('properties')}
        >
          Properties
        </button>
        <button className={tab === 'impact' ? 'active' : ''} onClick={() => setTab('impact')}>
          Impact & connections <small>{impact.directRelationships.length}</small>
        </button>
      </div>
      {tab === 'properties' ? (
        <form
          className="inspector-form"
          onSubmit={async (event) => {
            event.preventDefault()
            setError('')
            try {
              await commit(
                [
                  {
                    op: 'update_component',
                    id: component.id,
                    patch: {
                      name: draft.name,
                      kind: draft.kind,
                      technology: draft.technology,
                      description: draft.description,
                      owner: draft.owner,
                      boundaryId: draft.boundaryId,
                      tags: tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    },
                  },
                ],
                { message: `Updated ${draft.name}`, expectedRevision: baseRevision },
              )
              setDirty(false)
              notify('Component updated')
            } catch (cause) {
              setError((cause as Error).message)
            }
          }}
        >
          <div className="panel-scroll">
            <Field label="Name">
              <input
                required
                value={draft.name}
                maxLength={100}
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>
            <div className="field-row">
              <Field label="Type">
                <select
                  value={draft.kind}
                  onChange={(event) => update('kind', event.target.value as Component['kind'])}
                >
                  {kindEntries.map(([kind, info]) => (
                    <option value={kind} key={kind}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Technology">
                <input
                  value={draft.technology}
                  maxLength={100}
                  onChange={(event) => update('technology', event.target.value)}
                />
              </Field>
            </div>
            <Field label="Responsibility">
              <textarea
                rows={4}
                value={draft.description}
                maxLength={2000}
                onChange={(event) => update('description', event.target.value)}
                placeholder="What does this component own?"
              />
            </Field>
            <Field label="Boundary">
              <select
                value={draft.boundaryId ?? ''}
                onChange={(event) => update('boundaryId', event.target.value || null)}
              >
                <option value="">Outside a boundary</option>
                {project.boundaries.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              <input
                value={draft.owner}
                maxLength={100}
                onChange={(event) => update('owner', event.target.value)}
                placeholder="Team or individual"
              />
            </Field>
            <Field label="Tags" hint="comma-separated">
              <input
                value={tags}
                onChange={(event) => {
                  setTags(event.target.value)
                  setDirty(true)
                }}
                placeholder="core, payments, production"
              />
            </Field>
            <div className="section-label">AGENT ADDRESS</div>
            <div className="stable-id">
              <Braces size={14} />
              <code>{component.id}</code>
              <button
                type="button"
                aria-label="Copy stable component ID"
                title="Copy stable ID"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(component.id)
                    notify('Stable ID copied')
                  } catch {
                    notify('Clipboard unavailable')
                  }
                }}
              >
                <Copy size={13} />
              </button>
            </div>
            <p className="field-help">
              This ID stays the same when you rename or move this component.
            </p>
            {stale && (
              <div className="stale-draft">
                <p>The model changed while you were editing.</p>
                <button
                  type="button"
                  onClick={() => {
                    setDirty(false)
                    setError('')
                  }}
                >
                  <RotateCcw size={13} />
                  Reload saved properties
                </button>
              </div>
            )}
            <FormError error={error} />
          </div>
          <footer className="inspector-footer">
            <button className="button primary full" disabled={!dirty || busy || stale}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Save
              properties
            </button>
            <button
              className="button text danger-text full"
              type="button"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 size={14} />
              Remove component
            </button>
          </footer>
        </form>
      ) : (
        <div className="panel-scroll impact-content">
          <div className="impact-summary">
            <div>
              <ArrowDownLeft size={17} />
              <strong>{impact.upstream.length}</strong>
              <span>upstream</span>
            </div>
            <div>
              <ArrowUpRight size={17} />
              <strong>{impact.downstream.length}</strong>
              <span>downstream</span>
            </div>
          </div>
          <p className="impact-description">
            Directed graph traversal across all views. These are structural dependencies—not runtime
            health signals.
          </p>
          {(['upstream', 'downstream'] as const).map((direction) => (
            <section key={direction}>
              <div className="section-label">
                {direction === 'upstream'
                  ? 'DEPENDS ON THIS COMPONENT'
                  : 'THIS COMPONENT CONNECTS TO'}
              </div>
              {impact[direction].length ? (
                impact[direction].map((c) => (
                  <button className="impact-item" key={c.id} onClick={() => onSelect(c.id)}>
                    <KindIcon kind={c.kind} size={14} />
                    <span>
                      {c.name}
                      <small>{c.id}</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))
              ) : (
                <p className="muted-text">No {direction} components.</p>
              )}
            </section>
          ))}
          <section>
            <div className="section-label">DIRECT RELATIONSHIPS</div>
            {impact.directRelationships.map((rel) => (
              <div className="relationship-summary" key={rel.id}>
                <ArrowRight size={14} />
                <span>
                  {
                    project.components.find(
                      (c) => c.id === (rel.source === component.id ? rel.target : rel.source),
                    )?.name
                  }
                  <small>
                    {rel.protocol || rel.label || 'Connection'} ·{' '}
                    {rel.source === component.id ? 'outgoing' : 'incoming'}
                  </small>
                </span>
              </div>
            ))}
          </section>
        </div>
      )}
    </aside>
  )
}
export function RelationshipInspector({
  relationship,
  project,
  busy,
  commit,
  onClose,
  onDelete,
}: {
  relationship: Relationship
  project: Project
  busy: boolean
  commit: (operations: Operation[], options?: CommitOptions) => Promise<unknown>
  onClose: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(relationship),
    [dirty, setDirty] = useState(false),
    [baseRevision, setBaseRevision] = useState(project.revision),
    [error, setError] = useState('')
  useEffect(() => {
    if (!dirty) {
      setDraft(relationship)
      setBaseRevision(project.revision)
    }
  }, [relationship, project.revision, dirty])
  const update = <K extends keyof Relationship>(key: K, value: Relationship[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setDirty(true)
  }
  const stale = dirty && baseRevision !== project.revision
  return (
    <aside className="side-panel inspector-panel">
      <PanelHeader title="Connection details" icon={<ArrowRight size={16} />} onClose={onClose} />
      <div className="connection-identity">
        <span>{project.components.find((c) => c.id === relationship.source)?.name}</span>
        <ArrowRight size={18} />
        <span>{project.components.find((c) => c.id === relationship.target)?.name}</span>
      </div>
      <form
        className="inspector-form"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await commit(
              [
                {
                  op: 'update_relationship',
                  id: relationship.id,
                  patch: {
                    source: draft.source,
                    target: draft.target,
                    label: draft.label,
                    protocol: draft.protocol,
                    interaction: draft.interaction,
                    description: draft.description,
                  },
                },
              ],
              { expectedRevision: baseRevision, message: 'Updated connection details' },
            )
            setDirty(false)
          } catch (cause) {
            setError((cause as Error).message)
          }
        }}
      >
        <div className="panel-scroll">
          <Field label="From">
            <select value={draft.source} onChange={(event) => update('source', event.target.value)}>
              {project.components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select value={draft.target} onChange={(event) => update('target', event.target.value)}>
              {project.components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Relationship">
            <input
              value={draft.label}
              maxLength={100}
              onChange={(event) => update('label', event.target.value)}
              placeholder="How do they interact?"
            />
          </Field>
          <Field label="Protocol">
            <input
              value={draft.protocol}
              maxLength={60}
              onChange={(event) => update('protocol', event.target.value)}
            />
          </Field>
          <Field label="Interaction">
            <select
              value={draft.interaction}
              onChange={(event) => update('interaction', event.target.value as 'sync' | 'async')}
            >
              <option value="sync">Synchronous</option>
              <option value="async">Asynchronous</option>
            </select>
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              value={draft.description}
              maxLength={1000}
              onChange={(event) => update('description', event.target.value)}
            />
          </Field>
          <div className="stable-id">
            <Braces size={14} />
            <code>{relationship.id}</code>
          </div>
          {stale && (
            <div className="stale-draft">
              <p>The model changed while editing.</p>
              <button type="button" onClick={() => setDirty(false)}>
                Reload saved properties
              </button>
            </div>
          )}
          <FormError error={error} />
        </div>
        <footer className="inspector-footer">
          <button className="button primary full" disabled={!dirty || busy || stale}>
            <Check size={15} />
            Save connection
          </button>
          <button
            type="button"
            className="button text danger-text full"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 size={14} />
            Remove connection
          </button>
        </footer>
      </form>
    </aside>
  )
}
export function ActivityPanel({
  history,
  revision,
  onClose,
}: {
  history: ChangeEvent[]
  revision: number
  onClose: () => void
}) {
  return (
    <aside className="side-panel activity-panel">
      <PanelHeader title="Change history" icon={<History size={16} />} onClose={onClose} />
      <div className="panel-scroll activity-content">
        <div className="activity-heading">
          <span className="eyebrow">A MODEL THAT EVOLVES</span>
          <h3>
            Every change
            <br />
            has a story.
          </h3>
          <p>Human and agent edits share the same revision history.</p>
          <span className="revision-pill">
            <Braces size={13} />
            Current revision {revision}
          </span>
        </div>
        {history.length ? (
          <div className="activity-timeline">
            {history.map((event) => (
              <article key={event.id}>
                <span className={`activity-marker ${event.source}`}>
                  {event.source === 'agent' ? (
                    <Bot size={15} />
                  ) : event.source === 'undo' || event.source === 'redo' ? (
                    <RotateCcw size={14} />
                  ) : (
                    <User size={14} />
                  )}
                </span>
                <div>
                  <div className="activity-meta">
                    <strong>
                      {event.source === 'agent'
                        ? 'Agent'
                        : event.source === 'undo' || event.source === 'redo'
                          ? 'History'
                          : 'You'}
                    </strong>
                    <small>
                      r{event.revision} · {timeAgo(event.timestamp)}
                    </small>
                  </div>
                  <p>{event.message}</p>
                  {event.operations.length > 1 && (
                    <small className="activity-operation-count">
                      {event.operations.length} atomic operations
                    </small>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="small-empty">
            <History size={29} strokeWidth={1.2} />
            <h4>A fresh beginning.</h4>
            <p>Your first edit will appear here.</p>
            <small>Every saved change can be traced.</small>
          </div>
        )}
      </div>
      <footer className="assistant-footer">
        <History size={13} />
        Last 80 events · Up to 50 undo steps
      </footer>
    </aside>
  )
}
