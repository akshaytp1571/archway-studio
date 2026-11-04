import { EventEmitter } from 'node:events'
import { ProjectStore } from './store'
import type { ChangeRequest } from '../shared/model'

export class LiveProjectStore extends ProjectStore {
  readonly changes = new EventEmitter()
  override async apply(id: string, request: ChangeRequest) {
    const result = await super.apply(id, request)
    this.changes.emit('change', id, result.project.revision)
    return result
  }
  override async travel(id: string, revision: number, action: 'undo' | 'redo') {
    const result = await super.travel(id, revision, action)
    this.changes.emit('change', id, result.project.revision)
    return result
  }
}
