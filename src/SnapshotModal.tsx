import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../shared/model'
import { api, ApiError, type ProjectState } from './api'
import { Modal } from './Modals'

type SnapshotSummary = { id: string; name: string; createdAt: string; revision: number }
type SnapshotPreview = { project: Project; baseRevision: number; snapshot: SnapshotSummary }

type SnapshotModalProps = {
  project: Project
  onClose: () => void
  onRestore: (state: ProjectState) => void
  onImport?: () => void
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : 'The snapshot request failed.'
}

async function downloadCanonical(project: Project, snapshotId: string) {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(project.id)}/snapshots/${encodeURIComponent(snapshotId)}/export`,
  )
  if (!response.ok) {
    let detail = 'Could not download the canonical snapshot backup.'
    try {
      detail = ((await response.json()) as { message?: string }).message ?? detail
    } catch {
      // Keep the safe generic message if the server did not return JSON.
    }
    throw new Error(detail)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${snapshotId}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function SnapshotModal({
  project,
  onClose,
  onRestore,
  onImport,
}: SnapshotModalProps) {
  const listGeneration = useRef(0)
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<SnapshotPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadSnapshots = useCallback(async () => {
    const generation = ++listGeneration.current
    const result = await api<{ snapshots: SnapshotSummary[] }>(
      `/api/projects/${encodeURIComponent(project.id)}/snapshots`,
    )
    if (generation !== listGeneration.current) return
    setSnapshots(result.snapshots)
    setSelectedId((current) =>
      result.snapshots.some((snapshot) => snapshot.id === current)
        ? current
        : (result.snapshots[0]?.id ?? ''),
    )
  }, [project.id])

  useEffect(() => {
    const generation = ++listGeneration.current
    let active = true
    void api<{ snapshots: SnapshotSummary[] }>(
      `/api/projects/${encodeURIComponent(project.id)}/snapshots`,
    )
      .then((result) => {
        if (!active || generation !== listGeneration.current) return
        setSnapshots(result.snapshots)
        setSelectedId(result.snapshots[0]?.id ?? '')
      })
      .catch((cause) => {
        if (active && generation === listGeneration.current) setError(messageOf(cause))
      })
    return () => {
      active = false
    }
  }, [project.id])

  const discardReview = () => {
    setPreview(null)
    setConfirmed(false)
  }

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    ++listGeneration.current
    setBusy(true)
    setError('')
    discardReview()
    try {
      const result = await api<{ snapshot: SnapshotSummary }>(
        `/api/projects/${encodeURIComponent(project.id)}/snapshots`,
        { method: 'POST', body: { name: name.trim(), baseRevision: project.revision } },
      )
      setName('')
      await loadSnapshots()
      setSelectedId(result.snapshot.id)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const review = async () => {
    if (!selectedId) return
    setBusy(true)
    setError('')
    discardReview()
    try {
      const result = await api<SnapshotPreview>(
        `/api/projects/${encodeURIComponent(project.id)}/snapshots/${encodeURIComponent(selectedId)}/preview`,
        { method: 'POST', body: { baseRevision: project.revision } },
      )
      setPreview(result)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!preview || !confirmed || preview.baseRevision !== project.revision) return
    setBusy(true)
    setError('')
    try {
      const result = await api<ProjectState>(
        `/api/projects/${encodeURIComponent(project.id)}/snapshots/${encodeURIComponent(preview.snapshot.id)}/restore`,
        { method: 'POST', body: { baseRevision: preview.baseRevision } },
      )
      onRestore(result)
    } catch (cause) {
      setError(messageOf(cause))
      if (cause instanceof ApiError && cause.status === 409) discardReview()
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    if (!selectedId) return
    setBusy(true)
    setError('')
    try {
      await downloadCanonical(project, selectedId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const reviewIsCurrent = preview?.baseRevision === project.revision
  return (
    <Modal
      title="Recover a local snapshot"
      subtitle="Snapshots keep a named copy of the canonical project content on this computer."
      onClose={onClose}
      busy={busy}
      wide
    >
      <div className="modal-body">
        <form onSubmit={create}>
          <label className="field" htmlFor="snapshot-name">
            <span>Snapshot name</span>
            <input
              id="snapshot-name"
              aria-label="Snapshot name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Before the large refactor"
            />
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={busy || !name.trim() || snapshots.length >= 20}
          >
            Save snapshot at revision {project.revision}
          </button>
          {snapshots.length >= 20 && (
            <p role="status">This project has reached the 20-snapshot limit.</p>
          )}
        </form>

        <h3>Saved snapshots ({snapshots.length}/20)</h3>
        {snapshots.length ? (
          <ul aria-label="Project snapshots">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <button
                  type="button"
                  className="button"
                  aria-pressed={selectedId === snapshot.id}
                  onClick={() => {
                    setSelectedId(snapshot.id)
                    discardReview()
                    setError('')
                  }}
                >
                  {snapshot.name} Â· revision {snapshot.revision} Â·{' '}
                  {new Date(snapshot.createdAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No snapshots yet. Saving one does not change the project's revision or history.</p>
        )}

        <div className="modal-footer">
          <button
            className="button"
            type="button"
            onClick={download}
            disabled={busy || !selectedId}
          >
            Download canonical JSON
          </button>
          <button className="button" type="button" onClick={review} disabled={busy || !selectedId}>
            Preview restore
          </button>
          {onImport && (
            <button className="button" type="button" disabled={busy} onClick={onImport}>
              Import backup as a separate project
            </button>
          )}
        </div>

        {preview && (
          <section aria-labelledby="snapshot-preview-title">
            <h3 id="snapshot-preview-title">Restore preview: {preview.snapshot.name}</h3>
            <p>
              This replaces all current project contentâ€”name, description, components,
              relationships, boundaries, and viewsâ€”with the reviewed snapshot. Project ID and
              original creation time stay the same; a successful restore creates a new revision and
              history entry.
            </p>
            <p>
              Current: {project.components.length} components, {project.relationships.length}{' '}
              relationships, {project.boundaries.length} boundaries, {project.views.length} views.
            </p>
            <p>
              Snapshot: {preview.project.components.length} components,{' '}
              {preview.project.relationships.length} relationships,{' '}
              {preview.project.boundaries.length} boundaries, {preview.project.views.length} views.
            </p>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy || !reviewIsCurrent}
              />{' '}
              I reviewed this preview and authorize replacing the entire project content.
            </label>
            {!reviewIsCurrent && (
              <p role="alert">
                The project revision changed. Preview again against the latest project before
                restoring.
              </p>
            )}
            <div className="modal-footer">
              <button
                className="button primary"
                type="button"
                onClick={restore}
                disabled={busy || !confirmed || !reviewIsCurrent}
              >
                Restore reviewed snapshot
              </button>
            </div>
          </section>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button" type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </footer>
    </Modal>
  )
}

export type { SnapshotModalProps }
