import { z } from 'zod'
import { IdSchema, ModelError, ProjectSchema, assertValid, type Project } from './model'

export const SNAPSHOT_FORMAT_VERSION = 1 as const
export const MAX_PROJECT_SNAPSHOTS = 20
export const SnapshotNameSchema = z.string().trim().min(1).max(100)

export const SnapshotDocumentSchema = z
  .object({
    snapshotVersion: z.literal(SNAPSHOT_FORMAT_VERSION),
    id: IdSchema,
    projectId: IdSchema,
    name: SnapshotNameSchema,
    createdAt: z.iso.datetime(),
    sourceRevision: z.number().int().nonnegative(),
    project: ProjectSchema,
  })
  .strict()

export type SnapshotDocument = z.infer<typeof SnapshotDocumentSchema>
export type SnapshotSummary = Pick<SnapshotDocument, 'id' | 'name' | 'createdAt'> & {
  revision: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function versionLabel(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return value === undefined ? 'missing' : 'invalid'
}

function invalidSnapshot(message: string): ModelError {
  return new ModelError('SNAPSHOT_INVALID', 422, message)
}

/** Parses and validates a persisted snapshot without attempting an implicit migration. */
export function parseSnapshotDocument(
  value: unknown,
  expectedProjectId?: string,
  expectedSnapshotId?: string,
): SnapshotDocument {
  const raw = record(value)
  if (!raw) throw invalidSnapshot('Snapshot data must be a JSON object.')
  if (raw.snapshotVersion !== SNAPSHOT_FORMAT_VERSION) {
    if (raw.snapshotVersion === undefined)
      throw invalidSnapshot(
        'Snapshot data is missing snapshotVersion; preserve the file for recovery.',
      )
    throw new ModelError(
      'SNAPSHOT_VERSION_UNSUPPORTED',
      422,
      `Snapshot format version ${versionLabel(raw.snapshotVersion)} is unsupported. This release reads snapshotVersion 1 only; keep the file and use software with an explicit migration for its version.`,
    )
  }
  const rawProject = record(raw.project)
  if (rawProject?.schemaVersion !== 1) {
    throw new ModelError(
      'PROJECT_VERSION_UNSUPPORTED',
      422,
      `The snapshot's canonical project uses schemaVersion ${versionLabel(rawProject?.schemaVersion)}. This release reads project schemaVersion 1 only; preserve the file and use software with an explicit migration for its version.`,
    )
  }

  let snapshot: SnapshotDocument
  try {
    snapshot = SnapshotDocumentSchema.parse(value)
  } catch {
    throw invalidSnapshot('Snapshot data does not match the version 1 snapshot format.')
  }
  if (expectedProjectId && snapshot.projectId !== expectedProjectId)
    throw invalidSnapshot('Snapshot projectId does not match its containing project directory.')
  if (expectedSnapshotId && snapshot.id !== expectedSnapshotId)
    throw invalidSnapshot('Snapshot ID does not match its file name.')
  if (snapshot.project.id !== snapshot.projectId)
    throw invalidSnapshot('Snapshot canonical project ID does not match projectId.')
  if (snapshot.sourceRevision !== snapshot.project.revision)
    throw invalidSnapshot(
      'Snapshot sourceRevision does not match the saved canonical project revision.',
    )
  try {
    assertValid(snapshot.project)
  } catch (error) {
    if (error instanceof ModelError)
      throw new ModelError(
        'SNAPSHOT_INVALID',
        422,
        'Snapshot canonical project has invalid entity references and cannot be restored.',
        error.issues,
      )
    throw error
  }
  return snapshot
}

export function summarizeSnapshot(snapshot: SnapshotDocument): SnapshotSummary {
  return {
    id: snapshot.id,
    name: snapshot.name,
    createdAt: snapshot.createdAt,
    revision: snapshot.sourceRevision,
  }
}

export type { Project }
