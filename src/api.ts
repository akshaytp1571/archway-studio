import type { ChangeEvent, Project, ProjectSummary, ValidationReport } from '../shared/model'

export type ProjectState = {
  project: Project
  validation: ValidationReport
  history: ChangeEvent[]
  canUndo: boolean
  canRedo: boolean
}
export type ProviderState = {
  baseUrl: string
  model: string
  configured: boolean
  hasApiKey: boolean
  source: string
}
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message)
  }
}
export async function api<T>(
  url: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const data = await response.json()
  if (!response.ok)
    throw new ApiError(
      data.message ?? 'Request failed.',
      data.code ?? 'REQUEST_FAILED',
      response.status,
      data.issues ?? [],
    )
  return data as T
}
export async function listProjects(): Promise<ProjectSummary[]> {
  return (await api<{ projects: ProjectSummary[] }>('/api/projects')).projects
}
export async function downloadExport(
  project: Project,
  viewId: string,
  format: 'json' | 'svg' | 'mermaid',
) {
  const response = await fetch(
    `/api/projects/${project.id}/export?format=${format}&viewId=${viewId}`,
  )
  if (!response.ok) throw new Error('Could not export the architecture.')
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'architecture'}.${format === 'mermaid' ? 'mmd' : format}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
