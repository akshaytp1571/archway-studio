import { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectSchema, type Operation, type Project, type ProjectSummary } from '../shared/model'
import type { TemplateId } from '../shared/templates'
import { ApiError, api, listProjects, type ProjectState } from './api'

export type CommitOptions = {
  message?: string
  source?: 'human' | 'agent' | 'import'
  expectedRevision?: number
}
export function useStudio() {
  const [data, setData] = useState<ProjectState | null>(null),
    [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(0),
    [error, setError] = useState<Error | null>(null)
  const current = useRef<ProjectState | null>(null),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    loadToken = useRef(0),
    busyRef = useRef(0)
  const report = useCallback((cause: unknown) => {
    const value = cause instanceof Error ? cause : new Error('An unexpected error occurred.')
    setError(value)
    return value
  }, [])
  const markBusy = (delta: number) => {
    busyRef.current += delta
    setBusy(busyRef.current)
  }
  const accept = useCallback((value: ProjectState, force = false) => {
    if (
      !force &&
      current.current &&
      (current.current.project.id !== value.project.id ||
        current.current.project.revision > value.project.revision)
    )
      return
    current.current = value
    setData(value)
    localStorage.setItem('archway.activeProject', value.project.id)
  }, [])
  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects())
  }, [])
  const reload = useCallback(async () => {
    const id = current.current?.project.id
    if (id) accept(await api<ProjectState>(`/api/projects/${id}`))
  }, [accept])
  const openProject = useCallback(
    async (id: string) => {
      if (busyRef.current) return
      const token = ++loadToken.current
      setLoading(true)
      try {
        const value = await api<ProjectState>(`/api/projects/${id}`)
        if (token === loadToken.current) {
          accept(value, true)
          setError(null)
        }
      } catch (cause) {
        report(cause)
      } finally {
        if (token === loadToken.current) setLoading(false)
      }
    },
    [accept, report],
  )
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const items = await listProjects()
        if (!active) return
        setProjects(items)
        const saved = localStorage.getItem('archway.activeProject'),
          id = items.find((p) => p.id === saved)?.id ?? items[0]?.id
        if (id) {
          const value = await api<ProjectState>(`/api/projects/${id}`)
          if (active) accept(value, true)
        }
      } catch (cause) {
        if (active) report(cause)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [accept, report])
  useEffect(() => {
    const id = data?.project.id
    if (!id) return
    const stream = new EventSource(`/api/projects/${id}/events`)
    const listener = (event: MessageEvent) => {
      const change = JSON.parse(event.data)
      if (current.current?.project.id === id && change.revision > current.current.project.revision)
        void reload().catch(report)
    }
    stream.addEventListener('change', listener as EventListener)
    return () => {
      stream.close()
    }
  }, [data?.project.id, reload, report])
  const mutate = useCallback(
    <T>(
      action: (snapshot: ProjectState) => Promise<T>,
      onSuccess: (value: T) => void,
    ): Promise<T> => {
      const expectedId = current.current?.project.id
      markBusy(1)
      const task = queue.current
        .catch(() => undefined)
        .then(async () => {
          const snapshot = current.current
          if (!snapshot || snapshot.project.id !== expectedId)
            throw new ApiError(
              'The active project changed. Please try again.',
              'PROJECT_CHANGED',
              409,
            )
          const value = await action(snapshot)
          onSuccess(value)
          await refreshProjects()
          return value
        })
        .catch(async (cause) => {
          if (cause instanceof ApiError && cause.status === 409)
            await reload().catch(() => undefined)
          throw report(cause)
        })
        .finally(() => markBusy(-1))
      queue.current = task
      return task
    },
    [refreshProjects, reload, report],
  )
  const commit = useCallback(
    (operations: Operation[], options: CommitOptions = {}) =>
      mutate(
        (snapshot) => {
          if (
            options.expectedRevision !== undefined &&
            options.expectedRevision !== snapshot.project.revision
          )
            throw new ApiError(
              'The architecture changed while this proposal was open. Reload or regenerate it before applying.',
              'REVISION_CONFLICT',
              409,
            )
          return api<ProjectState>(`/api/projects/${snapshot.project.id}/changes`, {
            method: 'POST',
            body: {
              baseRevision: options.expectedRevision ?? snapshot.project.revision,
              operations,
              source: options.source ?? 'human',
              message: options.message ?? '',
            },
          })
        },
        (value) => accept(value),
      ),
    [mutate, accept],
  )
  const travel = useCallback(
    (action: 'undo' | 'redo') =>
      mutate(
        (snapshot) =>
          api<ProjectState>(`/api/projects/${snapshot.project.id}/history`, {
            method: 'POST',
            body: { baseRevision: snapshot.project.revision, action },
          }),
        (value) => accept(value),
      ),
    [mutate, accept],
  )
  const create = useCallback(
    async (template: TemplateId, name?: string, imported?: Project) => {
      if (busyRef.current) throw new Error('Wait for the current changes to save.')
      markBusy(1)
      try {
        const value = await api<ProjectState>('/api/projects', {
          method: 'POST',
          body: { template, ...(name ? { name } : {}), ...(imported ? { import: imported } : {}) },
        })
        ++loadToken.current
        accept(value, true)
        await refreshProjects()
        return value
      } catch (cause) {
        throw report(cause)
      } finally {
        markBusy(-1)
      }
    },
    [accept, refreshProjects, report],
  )
  const importFile = useCallback(
    async (file: File) => {
      if (file.size > 5 * 1024 * 1024)
        throw report(new Error('Choose an architecture JSON file smaller than 5 MB.'))
      let project: Project
      try {
        project = ProjectSchema.parse(JSON.parse(await file.text()))
      } catch {
        throw report(
          new Error(
            'This file is not a valid Archway architecture document. Export a canonical JSON model to import it.',
          ),
        )
      }
      return create('blank', `${project.name} (imported)`, project)
    },
    [create, report],
  )
  return {
    data,
    projects,
    loading,
    busy: busy > 0,
    error,
    dismissError: () => setError(null),
    openProject,
    reload,
    commit,
    travel,
    create,
    importFile,
    report,
  }
}
