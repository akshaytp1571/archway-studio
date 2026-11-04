import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  ArchitectureContentSchema,
  ChangeRequestSchema,
  IdSchema,
  ModelError,
  ProjectSchema,
  applyOperations,
  assertValid,
  contentOf,
  describeOperation,
  validateArchitecture,
  type ArchitectureContent,
  type ChangeEvent,
  type ChangeRequest,
  type Project,
} from '../shared/model'
import { createProject, summarizeProject, type TemplateId } from '../shared/templates'

type StoredProject = {
  project: Project
  history: ChangeEvent[]
  undo: ArchitectureContent[]
  redo: ArchitectureContent[]
}
export class RevisionConflict extends ModelError {
  constructor(public currentProject: Project) {
    super(
      'REVISION_CONFLICT',
      409,
      `The model is now at revision ${currentProject.revision}. Reload before applying these changes.`,
    )
  }
}
export class ProjectStore {
  private locks = new Map<string, Promise<unknown>>()
  readonly projectDirectory: string
  constructor(readonly dataDirectory: string) {
    this.projectDirectory = path.resolve(dataDirectory, 'projects')
  }
  async initialize(seed = true) {
    await mkdir(this.projectDirectory, { recursive: true })
    if (seed && !(await this.list()).length)
      await this.create('commerce', undefined, 'commerce-platform')
  }
  private file(id: string) {
    IdSchema.parse(id)
    const filename = path.resolve(this.projectDirectory, `${id}.json`)
    if (path.dirname(filename) !== this.projectDirectory)
      throw new ModelError('INVALID_ID', 400, 'Invalid project path.')
    return filename
  }
  private async read(id: string): Promise<StoredProject> {
    try {
      const stored = JSON.parse(await readFile(this.file(id), 'utf8')) as StoredProject
      stored.project = ProjectSchema.parse(stored.project)
      assertValid(stored.project)
      return stored
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ModelError('NOT_FOUND', 404, `Project ${id} does not exist.`)
      throw error
    }
  }
  private async write(stored: StoredProject) {
    const destination = this.file(stored.project.id)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, destination)
  }
  private async exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(action)
    this.locks.set(id, task)
    try {
      return await task
    } finally {
      if (this.locks.get(id) === task) this.locks.delete(id)
    }
  }
  async list() {
    const files = (await readdir(this.projectDirectory)).filter((file) => file.endsWith('.json'))
    const items = await Promise.all(
      files.map(async (file) => summarizeProject((await this.read(file.slice(0, -5))).project)),
    )
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async create(template: TemplateId, name?: string, id?: string, imported?: Project) {
    const project = imported
      ? ProjectSchema.parse({
          ...structuredClone(imported),
          id: `prj_${randomUUID()}`,
          name: name ?? imported.name,
          revision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      : createProject(template, name, id)
    assertValid(project)
    await this.exclusive(project.id, async () => {
      try {
        await this.read(project.id)
        throw new ModelError('DUPLICATE_ID', 409, 'This project already exists.')
      } catch (error) {
        if (!(error instanceof ModelError && error.code === 'NOT_FOUND')) throw error
      }
      await this.write({ project, history: [], undo: [], redo: [] })
    })
    return this.get(project.id)
  }
  async get(id: string) {
    const stored = await this.read(id)
    return {
      project: stored.project,
      validation: validateArchitecture(stored.project),
      history: stored.history.slice(-80).reverse(),
      canUndo: stored.undo.length > 0,
      canRedo: stored.redo.length > 0,
    }
  }
  async preview(id: string, input: ChangeRequest) {
    const request = ChangeRequestSchema.parse(input),
      { project } = await this.get(id)
    if (project.revision !== request.baseRevision) throw new RevisionConflict(project)
    const proposed = applyOperations(project, request.operations)
    return {
      project: proposed,
      validation: validateArchitecture(proposed),
      operations: request.operations.map(describeOperation),
      baseRevision: project.revision,
    }
  }
  async apply(id: string, input: ChangeRequest) {
    const request = ChangeRequestSchema.parse(input)
    return this.exclusive(id, async () => {
      const stored = await this.read(id)
      if (stored.project.revision !== request.baseRevision)
        throw new RevisionConflict(stored.project)
      const next = applyOperations(stored.project, request.operations)
      stored.undo.push(contentOf(stored.project))
      stored.undo = stored.undo.slice(-50)
      stored.redo = []
      next.revision = stored.project.revision + 1
      next.updatedAt = new Date().toISOString()
      stored.project = next
      stored.history.push({
        id: randomUUID(),
        revision: next.revision,
        timestamp: next.updatedAt,
        source: request.source,
        message:
          request.message || request.operations.map(describeOperation).join('; ').slice(0, 240),
        operations: request.operations.map(describeOperation),
      })
      stored.history = stored.history.slice(-200)
      await this.write(stored)
      return {
        project: next,
        validation: validateArchitecture(next),
        history: stored.history.slice(-80).reverse(),
        canUndo: stored.undo.length > 0,
        canRedo: false,
      }
    })
  }
  async travel(id: string, baseRevision: number, action: 'undo' | 'redo') {
    return this.exclusive(id, async () => {
      const stored = await this.read(id)
      if (stored.project.revision !== baseRevision) throw new RevisionConflict(stored.project)
      const from = action === 'undo' ? stored.undo : stored.redo,
        to = action === 'undo' ? stored.redo : stored.undo
      const content = from.pop()
      if (!content) throw new ModelError('NOTHING_TO_UNDO', 400, `There is nothing to ${action}.`)
      to.push(contentOf(stored.project))
      stored.project = ProjectSchema.parse({
        ...stored.project,
        ...ArchitectureContentSchema.parse(content),
        revision: stored.project.revision + 1,
        updatedAt: new Date().toISOString(),
      })
      assertValid(stored.project)
      stored.history.push({
        id: randomUUID(),
        revision: stored.project.revision,
        timestamp: stored.project.updatedAt,
        source: action,
        message: action === 'undo' ? 'Undid the previous change' : 'Restored the previous change',
        operations: [action],
      })
      stored.history = stored.history.slice(-200)
      await this.write(stored)
      return {
        project: stored.project,
        validation: validateArchitecture(stored.project),
        history: stored.history.slice(-80).reverse(),
        canUndo: stored.undo.length > 0,
        canRedo: stored.redo.length > 0,
      }
    })
  }
}
