import { useEffect, useState } from 'react'
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { BoundarySchema, type ComponentKind, type Operation, type Project } from '../shared/model'
import { Field, FormError, Modal } from './Modals'
import type { CommitOptions } from './useStudio'
import { KINDS, kindEntries, KindIcon } from './ui'

export type WorkspaceModalProps = {
  project: Project
  viewId: string
  commit: (ops: Operation[], options?: CommitOptions) => Promise<unknown>
  onClose: () => void
  onViewSelect?: (id: string) => void
}

function freshId(name: string, fallback: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug || fallback}-${crypto.randomUUID().slice(0, 8)}`
}

export function ViewsModal({
  project,
  viewId,
  commit,
  onClose,
  onViewSelect,
}: WorkspaceModalProps) {
  const [selectedId, setSelectedId] = useState(viewId),
    [mode, setMode] = useState<'edit' | 'create'>('edit'),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [kinds, setKinds] = useState<ComponentKind[]>([]),
    [draftRevision, setDraftRevision] = useState(project.revision),
    [confirmRemove, setConfirmRemove] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const selectedView = project.views.find((view) => view.id === selectedId),
    stale = project.revision !== draftRevision

  useEffect(() => {
    setSelectedId(viewId)
    setMode('edit')
  }, [viewId])
  useEffect(() => {
    if (mode !== 'edit') return
    const view = project.views.find((item) => item.id === selectedId)
    if (!view) return
    setName(view.name)
    setDescription(view.description)
    setKinds([...view.kinds])
    setDraftRevision(project.revision)
    setConfirmRemove(false)
    setError('')
  }, [mode, selectedId])

  const beginCreate = () => {
    setMode('create')
    setName('')
    setDescription('')
    setKinds([])
    setDraftRevision(project.revision)
    setConfirmRemove(false)
    setError('')
  }
  const reloadSaved = () => {
    const view = project.views.find((item) => item.id === selectedId) ?? project.views[0]
    if (!view) return
    setSelectedId(view.id)
    setMode('edit')
    setName(view.name)
    setDescription(view.description)
    setKinds([...view.kinds])
    setDraftRevision(project.revision)
    setConfirmRemove(false)
    setError('')
  }
  const toggleKind = (kind: ComponentKind) =>
    setKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    )

  return (
    <Modal
      title="Views"
      subtitle="Save different filters and independent layouts for this architecture."
      onClose={onClose}
      wide
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          if (stale) {
            setError(
              'The architecture changed while this draft was open. Reload the saved view before saving.',
            )
            return
          }
          setBusy(true)
          try {
            if (mode === 'create') {
              const source = project.views.find((view) => view.id === viewId) ?? project.views[0]
              if (!source) throw new Error('A view is required before creating another view.')
              const id = freshId(name, 'view')
              const view = {
                id,
                name: name.trim(),
                description,
                kinds: [...kinds],
                layout: structuredClone(source.layout),
              }
              await commit([{ op: 'add_view', view: view as Project['views'][number] }], {
                expectedRevision: draftRevision,
                message: `Created view ${name.trim()}`,
              })
              onViewSelect?.(id)
              onClose()
            } else if (selectedView) {
              const patch: { name?: string; description?: string; kinds?: ComponentKind[] } = {}
              if (name.trim() !== selectedView.name) patch.name = name.trim()
              if (description !== selectedView.description) patch.description = description
              if (
                kinds.length !== selectedView.kinds.length ||
                kinds.some((kind, index) => kind !== selectedView.kinds[index])
              )
                patch.kinds = [...kinds]
              if (!Object.keys(patch).length) {
                setError('There are no view changes to save.')
                return
              }
              await commit([{ op: 'update_view', id: selectedView.id, patch }], {
                expectedRevision: draftRevision,
                message: `Updated view ${selectedView.name}`,
              })
              onClose()
            }
          } catch (cause) {
            setError((cause as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="modal-body">
          <div className="field-row" role="group" aria-label="Saved views">
            {project.views.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`button ${mode === 'edit' && selectedId === view.id ? 'primary' : ''}`}
                aria-pressed={mode === 'edit' && selectedId === view.id}
                onClick={() => {
                  setMode('edit')
                  setSelectedId(view.id)
                  onViewSelect?.(view.id)
                }}
              >
                {view.name}
              </button>
            ))}
            <button
              className="button"
              type="button"
              onClick={beginCreate}
              aria-pressed={mode === 'create'}
            >
              <Plus size={15} /> New view
            </button>
          </div>
          <div className="field-row">
            <Field label="View name">
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Description" hint="optional">
              <input
                maxLength={1000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend className="section-label">Show component kinds</legend>
            <div className="kind-picker">
              {kindEntries.map(([kind, info]) => (
                <button
                  key={kind}
                  type="button"
                  className={kinds.includes(kind) ? 'selected' : ''}
                  aria-pressed={kinds.includes(kind)}
                  onClick={() => toggleKind(kind)}
                >
                  <KindIcon kind={kind} size={16} /> {info.label}
                  {kinds.includes(kind) && <Check size={12} />}
                </button>
              ))}
            </div>
            <span className="field-help">No kinds selected shows all components.</span>
          </fieldset>
          {stale && (
            <div className="info-note" role="status">
              <span>
                This architecture changed since the draft was opened. Reload saved values before
                saving.
              </span>
              <button className="button text" type="button" onClick={reloadSaved}>
                Reload saved
              </button>
            </div>
          )}
          {mode === 'edit' && selectedView && project.views.length > 1 && (
            <div className="field-row">
              {confirmRemove ? (
                <>
                  <span role="status">
                    Remove “{selectedView.name}”? You can undo this change from the workspace.
                  </span>
                  <button
                    className="button danger"
                    type="button"
                    disabled={busy || stale}
                    onClick={async () => {
                      setBusy(true)
                      setError('')
                      try {
                        await commit([{ op: 'remove_view', id: selectedView.id }], {
                          expectedRevision: draftRevision,
                          message: `Removed view ${selectedView.name}`,
                        })
                        const next = project.views.find((view) => view.id !== selectedView.id)
                        if (next) onViewSelect?.(next.id)
                        onClose()
                      } catch (cause) {
                        setError((cause as Error).message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Confirm remove view
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemove(false)}
                  >
                    Cancel removal
                  </button>
                </>
              ) : (
                <button
                  className="button danger"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 size={15} /> Remove view…
                </button>
              )}
            </div>
          )}
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || stale || !name.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}
            {mode === 'create' ? 'Create view' : 'Save view'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

export function BoundariesModal({ project, commit, onClose }: WorkspaceModalProps) {
  const [selectedId, setSelectedId] = useState(project.boundaries[0]?.id ?? ''),
    [mode, setMode] = useState<'edit' | 'create'>(project.boundaries.length ? 'edit' : 'create'),
    [name, setName] = useState(project.boundaries[0]?.name ?? ''),
    [type, setType] = useState<'system' | 'trust' | 'network'>(
      project.boundaries[0]?.type ?? 'system',
    ),
    [description, setDescription] = useState(project.boundaries[0]?.description ?? ''),
    [memberIds, setMemberIds] = useState<Set<string>>(
      new Set(
        project.components
          .filter((component) => component.boundaryId === project.boundaries[0]?.id)
          .map((component) => component.id),
      ),
    ),
    [draftRevision, setDraftRevision] = useState(project.revision),
    [confirmRemove, setConfirmRemove] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const selectedBoundary = project.boundaries.find((boundary) => boundary.id === selectedId),
    stale = project.revision !== draftRevision,
    savedMembers = selectedBoundary
      ? project.components.filter((component) => component.boundaryId === selectedBoundary.id)
          .length
      : 0

  const loadBoundary = (id: string) => {
    const boundary = project.boundaries.find((item) => item.id === id)
    if (!boundary) return
    setSelectedId(id)
    setMode('edit')
    setName(boundary.name)
    setType(boundary.type)
    setDescription(boundary.description)
    setMemberIds(
      new Set(
        project.components
          .filter((component) => component.boundaryId === id)
          .map((component) => component.id),
      ),
    )
    setDraftRevision(project.revision)
    setConfirmRemove(false)
    setError('')
  }
  const beginCreate = () => {
    setMode('create')
    setSelectedId('')
    setName('')
    setType('system')
    setDescription('')
    setMemberIds(new Set())
    setDraftRevision(project.revision)
    setConfirmRemove(false)
    setError('')
  }
  const reloadSaved = () => {
    const boundary =
      project.boundaries.find((item) => item.id === selectedId) ?? project.boundaries[0]
    if (boundary) loadBoundary(boundary.id)
    else beginCreate()
  }
  const toggleMember = (id: string) =>
    setMemberIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Modal
      title="Boundaries"
      subtitle="Group components for clear system, trust, or network context. Membership is model data."
      onClose={onClose}
      wide
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          if (stale) {
            setError(
              'The architecture changed while this draft was open. Reload saved values before saving.',
            )
            return
          }
          const boundaryId = mode === 'create' ? freshId(name, 'boundary') : selectedBoundary?.id
          if (!boundaryId) {
            setError('This boundary no longer exists. Reload the saved boundaries.')
            return
          }
          const boundaryPatch: {
            name?: string
            type?: 'system' | 'trust' | 'network'
            description?: string
          } = {}
          if (mode === 'edit' && selectedBoundary) {
            if (name.trim() !== selectedBoundary.name) boundaryPatch.name = name.trim()
            if (type !== selectedBoundary.type) boundaryPatch.type = type
            if (description !== selectedBoundary.description)
              boundaryPatch.description = description
          }
          const operations: Operation[] =
            mode === 'create'
              ? [
                  {
                    op: 'add_boundary',
                    boundary: BoundarySchema.parse({
                      id: boundaryId,
                      name: name.trim(),
                      type,
                      description,
                    }),
                  },
                ]
              : Object.keys(boundaryPatch).length
                ? [{ op: 'update_boundary', id: boundaryId, patch: boundaryPatch }]
                : []
          for (const component of project.components) {
            const selected = memberIds.has(component.id)
            if (mode === 'create') {
              if (selected && component.boundaryId !== boundaryId)
                operations.push({ op: 'update_component', id: component.id, patch: { boundaryId } })
            } else if (
              (selected && component.boundaryId !== boundaryId) ||
              (!selected && component.boundaryId === boundaryId)
            ) {
              operations.push({
                op: 'update_component',
                id: component.id,
                patch: { boundaryId: selected ? boundaryId : null },
              })
            }
          }
          if (!operations.length) {
            setError('There are no boundary or membership changes to save.')
            return
          }
          if (operations.length > 100) {
            setError(
              `This edit needs ${operations.length} operations; a transaction allows at most 100. Select fewer members to move in this save, then repeat the remaining changes. Nothing was saved.`,
            )
            return
          }
          setBusy(true)
          try {
            await commit(operations, {
              expectedRevision: draftRevision,
              message:
                mode === 'create'
                  ? `Created boundary ${name.trim()}`
                  : `Updated boundary ${name.trim()}`,
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
          <div className="field-row" role="group" aria-label="Saved boundaries">
            {project.boundaries.map((boundary) => (
              <button
                key={boundary.id}
                type="button"
                className={`button ${mode === 'edit' && selectedId === boundary.id ? 'primary' : ''}`}
                aria-pressed={mode === 'edit' && selectedId === boundary.id}
                onClick={() => loadBoundary(boundary.id)}
              >
                {boundary.name}
              </button>
            ))}
            <button
              className="button"
              type="button"
              onClick={beginCreate}
              aria-pressed={mode === 'create'}
            >
              <Plus size={15} /> New boundary
            </button>
          </div>
          <div className="field-row">
            <Field label="Boundary name">
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Type">
              <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
                <option value="system">System</option>
                <option value="trust">Trust</option>
                <option value="network">Network</option>
              </select>
            </Field>
          </div>
          <Field label="Description" hint="optional">
            <textarea
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <fieldset
            className="field"
            aria-label="Boundary component members"
            style={{ border: 0, padding: 0 }}
          >
            <legend className="section-label">Component members</legend>
            {project.components.length ? (
              project.components.map((component) => (
                <label
                  key={component.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}
                >
                  <input
                    type="checkbox"
                    checked={memberIds.has(component.id)}
                    onChange={() => toggleMember(component.id)}
                  />
                  <span>
                    {component.name}{' '}
                    <small>
                      ({component.id} · {KINDS[component.kind].label})
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <p>No components are available to assign.</p>
            )}
          </fieldset>
          {stale && (
            <div className="info-note" role="status">
              <span>
                The architecture changed since this draft was opened. Reload saved values before
                saving.
              </span>
              <button className="button text" type="button" onClick={reloadSaved}>
                Reload saved
              </button>
            </div>
          )}
          {mode === 'edit' && selectedBoundary && (
            <div className="field-row">
              {confirmRemove ? (
                <>
                  <span role="status">Confirm removal of “{selectedBoundary.name}”.</span>
                  <button
                    className="button danger"
                    type="button"
                    disabled={busy || stale}
                    onClick={async () => {
                      setError('')
                      if (
                        project.components.some(
                          (component) => component.boundaryId === selectedBoundary.id,
                        )
                      ) {
                        setError(
                          'This boundary is in use. Move its members to another boundary or outside all boundaries first.',
                        )
                        setConfirmRemove(false)
                        return
                      }
                      setBusy(true)
                      try {
                        await commit([{ op: 'remove_boundary', id: selectedBoundary.id }], {
                          expectedRevision: draftRevision,
                          message: `Removed boundary ${selectedBoundary.name}`,
                        })
                        onClose()
                      } catch (cause) {
                        setError((cause as Error).message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Confirm remove boundary
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemove(false)}
                  >
                    Cancel removal
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button danger"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 size={15} /> Remove boundary…
                  </button>
                  {savedMembers > 0 && (
                    <span role="note">In use: move members first; removal will be rejected.</span>
                  )}
                </>
              )}
            </div>
          )}
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || stale || !name.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}
            {mode === 'create' ? 'Create boundary' : 'Save boundary'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
