import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  ChangeRequestSchema,
  IdSchema,
  ModelError,
  ProjectSchema,
  analyzeImpact,
} from '../shared/model'
import type { ProjectStore } from './store'

async function result(action: () => Promise<unknown>) {
  try {
    const value = await action()
    return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            code: error instanceof ModelError ? error.code : 'INVALID_REQUEST',
            message: error instanceof Error ? error.message : 'Request failed',
            ...(error instanceof ModelError ? { issues: error.issues } : {}),
          }),
        },
      ],
    }
  }
}
export function createMcpServer(store: ProjectStore) {
  const server = new McpServer({ name: 'archway', version: '0.1.0' })
  server.registerTool(
    'list_projects',
    {
      description:
        'List available architecture projects with their stable IDs and current revisions.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => result(async () => ({ projects: await store.list() })),
  )
  server.registerTool(
    'get_architecture',
    {
      description:
        'Read the canonical typed architecture model, views, validation results, and latest revision. Always read before changing a project.',
      inputSchema: { projectId: IdSchema },
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) => result(() => store.get(projectId)),
  )
  server.registerTool(
    'get_model_schema',
    {
      description:
        'Get JSON schemas for architecture documents and transactional change requests. Use these schemas when proposing edits.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      result(async () => ({
        project: z.toJSONSchema(ProjectSchema),
        changes: z.toJSONSchema(ChangeRequestSchema, { io: 'input' }),
      })),
  )
  server.registerTool(
    'preview_changes',
    {
      description:
        'Validate and preview an atomic batch of semantic architecture operations without saving. baseRevision must match the current model. Review the result before calling apply_changes.',
      inputSchema: { projectId: IdSchema, request: ChangeRequestSchema },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, request }) =>
      result(() => store.preview(projectId, { ...request, source: 'agent' })),
  )
  server.registerTool(
    'apply_changes',
    {
      description:
        'Atomically apply a schema-validated architecture change batch at an expected baseRevision. Saves a revision and undo history. Returns REVISION_CONFLICT if another actor edited the model. Preview first. May remove components when explicitly requested.',
      inputSchema: { projectId: IdSchema, request: ChangeRequestSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    ({ projectId, request }) =>
      result(() => store.apply(projectId, { ...request, source: 'agent' })),
  )
  server.registerTool(
    'analyze_impact',
    {
      description:
        'Find all upstream and downstream components, direct relationships, and affected views for a component. Handles cycles safely.',
      inputSchema: { projectId: IdSchema, componentId: IdSchema },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, componentId }) =>
      result(async () => analyzeImpact((await store.get(projectId)).project, componentId)),
  )
  return server
}
