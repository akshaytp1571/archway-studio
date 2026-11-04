import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { ModelError, OperationSchema, type Project } from '../shared/model'

export const ProviderSettingsSchema = z
  .object({
    baseUrl: z.url().refine((url) => /^https?:\/\//.test(url), 'Use an HTTP or HTTPS URL.'),
    model: z.string().trim().min(1).max(150),
    apiKey: z.string().max(4000).optional(),
    enabled: z.boolean().default(true),
  })
  .strict()
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
    try {
      const saved = ProviderSettingsSchema.parse(JSON.parse(await readFile(this.file, 'utf8')))
      return { ...saved, apiKey: saved.apiKey ?? '', source: 'settings' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
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
  async save(input: z.infer<typeof ProviderSettingsSchema>) {
    const parsed = ProviderSettingsSchema.parse(input),
      previous = await this.get()
    await mkdir(this.directory, { recursive: true })
    await writeFile(
      this.file,
      JSON.stringify(
        { ...parsed, apiKey: parsed.apiKey === undefined ? previous.apiKey : parsed.apiKey },
        null,
        2,
      ),
      { encoding: 'utf8', mode: 0o600 },
    )
    return this.publicSettings()
  }
}
const PlanSchema = z
  .object({
    summary: z.string().min(1).max(1500),
    operations: z.array(OperationSchema).min(1).max(50),
  })
  .strict()
export async function planWithProvider(config: ProviderConfig, project: Project, prompt: string) {
  if (!config.enabled)
    throw new ModelError(
      'PROVIDER_NOT_CONFIGURED',
      400,
      'Connect an OpenAI-compatible provider in Settings, or try a built-in recipe. Recipes do not use an LLM.',
    )
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const system = `You are an expert software architecture assistant inside Archway. Propose precise, minimal architecture changes. Never apply them yourself. The user will preview the changes. Return ONLY a JSON object with keys "summary" (a concise, plain-language explanation) and "operations" (an array following the supplied operation schema). Use stable, meaningful IDs. Preserve existing IDs. Components represent software semantics; x/y positions are optional view layout. Do not invent existing components. Refer only to existing IDs or IDs added earlier in your proposal. Do not use replace_content, remove_view, or set_layout. When removing a connected component, cascade must be explicitly true. You may add boundaries but must add them before referencing them. Avoid unrelated modifications. Do not include markdown fences. Operation schema: ${JSON.stringify(z.toJSONSchema(OperationSchema))}`
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
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
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60000),
    })
  } catch (error) {
    if ((error as Error).name === 'TimeoutError')
      throw new ModelError(
        'PROVIDER_TIMEOUT',
        504,
        'The model took too long to respond. Please try again.',
      )
    throw new ModelError(
      'PROVIDER_UNREACHABLE',
      502,
      'Could not reach the model provider. Check the base URL and whether the provider is running.',
    )
  }
  if (!response.ok)
    throw new ModelError(
      'PROVIDER_ERROR',
      502,
      `The model provider returned HTTP ${response.status}. Check your model, API key, and OpenAI-compatible base URL.`,
    )
  let body: { choices?: { message?: { content?: string } }[] }
  try {
    body = await response.json()
  } catch {
    throw new ModelError(
      'PROVIDER_INVALID_RESPONSE',
      502,
      'The model provider did not return a valid JSON response.',
    )
  }
  const text = body.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string')
    throw new ModelError(
      'PROVIDER_INVALID_RESPONSE',
      502,
      'The model provider returned no text. Use a model that supports chat completions and JSON output.',
    )
  let value: unknown
  try {
    value = JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''))
  } catch {
    throw new ModelError(
      'PLAN_INVALID',
      422,
      'The model returned an invalid JSON plan. No changes were applied. Please try a more specific request.',
    )
  }
  const parsed = PlanSchema.safeParse(value)
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
