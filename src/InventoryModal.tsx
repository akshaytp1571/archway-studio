import { useRef, useState } from 'react'
import { ModelError, type Project } from '../shared/model'
import type { InventoryReport } from '../shared/inventory'
import { Modal, FormError } from './Modals'
import { api } from './api'
import type { Proposal } from './Panels'

export type InventoryProposal = Proposal & { mode: 'inventory'; report: InventoryReport }
export function InventoryModal({
  project,
  onClose,
  onPreview,
}: {
  project: Project
  onClose: () => void
  onPreview: (value: InventoryProposal) => void
}) {
  const [input, setInput] = useState<unknown>(),
    [fileName, setFileName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [proposal, setProposal] = useState<InventoryProposal | null>(null)
  const loadGeneration = useRef(0)
  const stale = proposal !== null && proposal.baseRevision !== project.revision
  return (
    <Modal
      title="Discover from local inventory"
      subtitle="Upload a local inventoryVersion 1 JSON file. No scanning, execution, or cloud access."
      onClose={onClose}
      busy={busy}
      wide
    >
      <div className="modal-body">
        <label className="field">
          <span>Inventory JSON file</span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Inventory JSON file"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              const generation = ++loadGeneration.current
              setProposal(null)
              setInput(undefined)
              setError('')
              setFileName(file?.name ?? '')
              if (!file) return
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw new ModelError(
                    'BODY_TOO_LARGE',
                    413,
                    'Choose an inventory file smaller than 5 MB.',
                  )
                const value: unknown = JSON.parse(await file.text())
                if (generation === loadGeneration.current) setInput(value)
              } catch (cause) {
                if (generation === loadGeneration.current) setError((cause as Error).message)
              }
            }}
          />
        </label>
        <p>
          Stable IDs match existing entities. Supplied properties can update them; omitted
          properties and unrelated entities are preserved. At most 100 operations per preview.
        </p>
        <p>
          Only the declared inventory fields are supported. No import can run code or fetch a URL.
          Invalid input is rejected rather than partially applied.
        </p>
        <button
          className="button"
          disabled={busy || input === undefined}
          onClick={async () => {
            setBusy(true)
            setError('')
            setProposal(null)
            try {
              setProposal(
                await api<InventoryProposal>(
                  `/api/projects/${encodeURIComponent(project.id)}/inventory/preview`,
                  { method: 'POST', body: { baseRevision: project.revision, inventory: input } },
                ),
              )
            } catch (cause) {
              setError((cause as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          Preview inventory
        </button>
        {proposal && (
          <section aria-label="Inventory mapping report">
            <h3>{fileName}</h3>
            <p>{proposal.summary}</p>
            <p>
              {proposal.report.added} added · {proposal.report.updated} updated ·{' '}
              {proposal.report.unchanged} unchanged · {proposal.report.skipped} skipped
            </p>
            {proposal.report.warnings.map((warning, index) => (
              <p key={index}>{warning}</p>
            ))}
            {!proposal.operations.length && (
              <p role="status">This inventory has no changes to apply.</p>
            )}
            {stale && <p role="alert">The project changed. Preview again before reviewing.</p>}
          </section>
        )}
        <FormError error={error} />
      </div>
      <footer className="modal-footer">
        <button className="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || !proposal?.operations.length || stale}
          onClick={() => {
            if (proposal) {
              onPreview(proposal)
              onClose()
            }
          }}
        >
          Review inventory proposal
        </button>
      </footer>
    </Modal>
  )
}
