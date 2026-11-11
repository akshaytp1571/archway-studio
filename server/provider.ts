import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { ModelError, OperationSchema, type Project } from '../shared/model'
import { normalizeProviderBaseUrl } from '../shared/provider-settings'

const PersistedProviderSettingsSchema = z
  .object({
    baseUrl: z.url().refine((url) => /^https?:\/\//.test(url), 'Use an HTTP or HTTPS URL.'),
    model: z.string().trim().min(1).max(150),
    apiKey: z.string().max(4000).optional(),
    enabled: z.boolean().default(true),
  })
  .strict()
export const ProviderSettingsSchema = PersistedProviderSettingsSchema.extend({
  reuseApiKey: z.boolean().optional(),
}).strict()
export type ProviderSettingsInput = z.input<typeof ProviderSettingsSchema>
export type PersistedProviderSettings = z.infer<typeof PersistedProviderSettingsSchema>
export type ProviderConfig = {
  baseUrl: string
  model: string
  apiKey: string
  enabled: boolean
  source: 'environment' | 'settings' | 'none'
}
export class ProviderSettings {
  private file: string
  constructor(private directory: string) {
    this.file = path.resolve(directory, 'provider-settings.json')
  }
  async get(): Promise<ProviderConfig> {
    const saved = await this.getSaved()
    if (saved.source === 'settings') return saved
    const key = process.env.ARCHWAY_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
    const baseUrl =
      process.env.ARCHWAY_LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
    const model = process.env.ARCHWAY_LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
    return {
      baseUrl,
      model,
      apiKey: key,
      enabled: Boolean(key || process.env.ARCHWAY_LLM_BASE_URL || process.env.OPENAI_BASE_URL),
      source:
        key || process.env.ARCHWAY_LLM_BASE_URL || process.env.OPENAI_BASE_URL
          ? 'environment'
          : 'none',
    }
  }
  async getSaved(): Promise<ProviderConfig> {
    try {
      const saved = PersistedProviderSettingsSchema.parse(
        JSON.parse(await readFile(this.file, 'utf8')),
      )
      return { ...saved, apiKey: saved.apiKey ?? '', source: 'settings' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        apiKey: '',
        enabled: false,
        source: 'none',
      }
    }
  }
  async publicSettings() {
    const config = await this.get()
    return {
      baseUrl: config.baseUrl,
      model: config.model,
      configured: config.enabled,
      hasApiKey: Boolean(config.apiKey),
      source: config.source,
    }
  }
  async save(input: ProviderSettingsInput) {
    const parsed = ProviderSettingsSchema.parse(input),
      previous = await this.get()
    let apiKey = parsed.apiKey
    if (apiKey === undefined) {
      const hasPreviousKey = Boolean(previous.apiKey)
      const isSameSavedEndpoint =
        previous.source === 'settings' &&
        normalizeProviderBaseUrl(previous.baseUrl) === normalizeProviderBaseUrl(parsed.baseUrl)
      if (hasPreviousKey && isSameSavedEndpoint) apiKey = previous.apiKey
      else if (hasPreviousKey && parsed.reuseApiKey !== true)
        throw new ModelError(
          'PROVIDER_KEY_CONFIRMATION_REQUIRED',
          400,
          'A configured API key will not be reused automatically. Provide apiKey or set reuseApiKey to true to confirm reuse.',
        )
      else apiKey = previous.apiKey
    }
    const settings: PersistedProviderSettings = {
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      apiKey,
      enabled: parsed.enabled,
    }
    await mkdir(this.directory, { recursive: true })
    await writeFile(this.file, JSON.stringify(settings, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
    return this.publicSettings()
  }
}
const PlanSchema = z
  .object({
    summary: z.string().min(1).max(1500),
    operations: z.array(OperationSchema).min(1).max(50),
  })
  .strict()
const DEFAULT_TIMEOUT_MS = 60_000

type ProviderRequestOptions = { signal?: AbortSignal; timeoutMs?: number }
type ProviderRequestContext = {
  signal: AbortSignal
  timedOut: () => boolean
  dispose: () => void
}

function createProviderRequestContext(
  options: ProviderRequestOptions = {},
): ProviderRequestContext {
  const controller = new AbortController()
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? Math.min(DEFAULT_TIMEOUT_MS, Math.max(1, options.timeoutMs))
      : DEFAULT_TIMEOUT_MS
  let timeout = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const onExternalAbort = () => {
    if (timer) clearTimeout(timer)
    controller.abort()
  }
  if (options.signal?.aborted) controller.abort()
  else {
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })
    timer = setTimeout(() => {
      timeout = true
      controller.abort()
    }, timeoutMs)
  }
  return {
    signal: controller.signal,
    timedOut: () => timeout,
    dispose: () => {
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onExternalAbort)
    },
  }
}

function throwIfCancelled(context: ProviderRequestContext): void {
  if (context.timedOut())
    throw new ModelError(
      'PROVIDER_TIMEOUT',
      504,
      'The provider request timed out. Please try again.',
    )
  if (context.signal.aborted)
    throw new ModelError('PROVIDER_CANCELLED', 499, 'The provider request was cancelled.')
}

function invalidProviderResponse(message: string): ModelError {
  return new ModelError('PROVIDER_INVALID_RESPONSE', 502, message)
}

async function requestChatCompletion(
  config: ProviderConfig,
  messages: { role: 'system' | 'user'; content: string }[],
  options: ProviderRequestOptions = {},
): Promise<string> {
  if (!config.enabled)
    throw new ModelError(
      'PROVIDER_NOT_CONFIGURED',
      400,
      'Connect an enabled OpenAI-compatible provider in Settings, or try a built-in recipe. Recipes do not use an LLM.',
    )
  const context = createProviderRequestContext(options)
  try {
    let response: Response
    try {
      response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: 'json_object' },
        }),
        signal: context.signal,
      })
    } catch {
      throwIfCancelled(context)
      throw new ModelError(
        'PROVIDER_UNREACHABLE',
        502,
        'Could not reach the model provider. Check the base URL and whether the provider is running.',
      )
    }
    throwIfCancelled(context)
    if (!response.ok)
      throw new ModelError(
        'PROVIDER_ERROR',
        502,
        `The model provider returned HTTP ${response.status}. Check your model, API key, and OpenAI-compatible base URL.`,
      )
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throwIfCancelled(context)
      throw invalidProviderResponse('The model provider did not return a valid JSON response.')
    }
    throwIfCancelled(context)
    if (body === null || typeof body !== 'object' || Array.isArray(body))
      throw invalidProviderResponse(
        'The model provider returned an invalid chat-completions response.',
      )
    const choices = (body as { choices?: unknown }).choices
    if (
      !Array.isArray(choices) ||
      choices.length === 0 ||
      choices[0] === null ||
      typeof choices[0] !== 'object'
    )
      throw invalidProviderResponse('The model provider returned no chat-completions choice.')
    const message = (choices[0] as { message?: unknown }).message
    if (message === null || typeof message !== 'object' || Array.isArray(message))
      throw invalidProviderResponse('The model provider returned no chat-completions message.')
    const text = (message as { content?: unknown }).content
    if (typeof text !== 'string' || !text.trim())
      throw invalidProviderResponse(
        'The model provider returned no text. Use a model that supports chat completions and JSON output.',
      )
    return text
  } finally {
    context.dispose()
  }
}

function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')) as unknown
  } catch {
    throw new ModelError(
      'PLAN_INVALID',
      422,
      'The model returned an invalid JSON plan. No changes were applied. Please try a more specific request.',
    )
  }
}

export async function planWithProvider(
  config: ProviderConfig,
  project: Project,
  prompt: string,
  options?: ProviderRequestOptions,
) {
  const system = `You are an expert software architecture assistant inside Archway. Propose precise, minimal architecture changes. Never apply them yourself. The user will preview the changes. Return ONLY a JSON object with keys "summary" (a concise, plain-language explanation) and "operations" (an array following the supplied operation schema). Use stable, meaningful IDs. Preserve existing IDs. Components represent software semantics; x/y positions are optional view layout. Do not invent existing components. Refer only to existing IDs or IDs added earlier in your proposal. Do not use replace_content, remove_view, or set_layout. When removing a connected component, cascade must be explicitly true. You may add boundaries but must add them before referencing them. Avoid unrelated modifications. Do not include markdown fences. Operation schema: ${JSON.stringify(z.toJSONSchema(OperationSchema))}`
  const text = await requestChatCompletion(
    config,
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          request: prompt,
          architecture: {
            id: project.id,
            revision: project.revision,
            name: project.name,
            description: project.description,
            components: project.components,
            relationships: project.relationships,
            boundaries: project.boundaries,
            views: project.views.map((v) => ({ id: v.id, name: v.name, kinds: v.kinds })),
          },
        }),
      },
    ],
    options,
  )
  const parsed = PlanSchema.safeParse(parseModelJson(text))
  if (!parsed.success)
    throw new ModelError(
      'PLAN_INVALID',
      422,
      'The proposed changes did not match the architecture schema. No changes were applied.',
      parsed.error.issues.map((i) => ({
        code: i.code,
        path: i.path.join('.'),
        message: i.message,
      })),
    )
  if (
    parsed.data.operations.some((op) =>
      ['replace_content', 'remove_view', 'set_layout'].includes(op.op),
    )
  )
    throw new ModelError(
      'PLAN_TOO_BROAD',
      422,
      'The model proposed an unsupported bulk edit. Ask for a smaller, specific architecture change.',
    )
  return { ...parsed.data, mode: 'provider' as const, model: config.model }
}

export async function testProviderConnection(
  config: ProviderConfig,
  options?: ProviderRequestOptions,
): Promise<{ ok: true; model: string; latencyMs: number; checkedAt: string }> {
  const started = performance.now()
  const text = await requestChatCompletion(
    config,
    [
      {
        role: 'system',
        content:
          'Reply only with the JSON object {"ok":true}. This is a connection test; do not perform any actions.',
      },
      { role: 'user', content: 'Return exactly {"ok":true}.' },
    ],
    options,
  )
  let value: unknown
  try {
    value = JSON.parse(
      text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''),
    ) as unknown
  } catch {
    throw invalidProviderResponse(
      'The provider responded with invalid JSON for the connection test.',
    )
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as { ok?: unknown }).ok !== true ||
    Object.keys(value).length !== 1
  )
    throw invalidProviderResponse(
      'The provider responded, but did not return the required {"ok":true} test response.',
    )
  return {
    ok: true,
    model: config.model,
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
    checkedAt: new Date().toISOString(),
  }
}

export type { ProviderRequestOptions }
export const PROVIDER_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS
