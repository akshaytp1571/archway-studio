import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { planWithProvider, ProviderSettings } from '../server/provider'
import { createProject } from '../shared/templates'
import { applyOperations, ModelError } from '../shared/model'
import { normalizeProviderBaseUrl } from '../shared/provider-settings'

test('provider URL normalization is limited to canonical URL equivalence', () => {
  assert.equal(
    normalizeProviderBaseUrl(' HTTPS://Example.COM:443/v1///?Q=Keep#Part '),
    'https://example.com/v1?Q=Keep#Part',
  )
  assert.equal(normalizeProviderBaseUrl(' https://example.com/V1/ '), 'https://example.com/V1')
  assert.equal(normalizeProviderBaseUrl(' not a URL/// '), 'not a URL///')
})

test('provider settings safely reuse keys only for saved same-endpoint configuration', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'archway-provider-test-'))
  const envNames = [
    'ARCHWAY_LLM_API_KEY',
    'OPENAI_API_KEY',
    'ARCHWAY_LLM_BASE_URL',
    'OPENAI_BASE_URL',
    'ARCHWAY_LLM_MODEL',
    'OPENAI_MODEL',
  ] as const
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  for (const name of envNames) delete process.env[name]
  try {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('archway-provider-test-'))
  } catch (error) {
    for (const name of envNames) {
      const value = originalEnv[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  const settings = new ProviderSettings(directory)
  const save = (
    baseUrl: string,
    additions: { apiKey?: string; enabled?: boolean; reuseApiKey?: boolean } = {},
  ) => settings.save({ baseUrl, model: 'test-model', ...additions })
  const disk = async () => {
    try {
      return JSON.parse(
        await readFile(path.join(directory, 'provider-settings.json'), 'utf8'),
      ) as Record<string, unknown>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }
  const expectConfirmationRequired = async (promise: Promise<unknown>) => {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof ModelError)
      assert.equal(error.code, 'PROVIDER_KEY_CONFIRMATION_REQUIRED')
      assert.equal(error.status, 400)
      assert.match(error.message, /provide apiKey|reuseApiKey/i)
      return true
    })
  }
  try {
    await t.test('existing persisted settings remain readable', async () => {
      await writeFile(
        path.join(directory, 'provider-settings.json'),
        JSON.stringify({
          baseUrl: 'https://provider.example/v1',
          model: 'legacy-model',
          apiKey: 'dummy-legacy-key',
          enabled: true,
        }),
      )
      const legacy = await settings.get()
      assert.equal(legacy.source, 'settings')
      assert.equal(legacy.apiKey, 'dummy-legacy-key')
      assert.equal(legacy.model, 'legacy-model')
    })

    await t.test('same saved endpoint preserves the key but never returns it', async () => {
      await rm(path.join(directory, 'provider-settings.json'), { force: true })
      const result = await save('https://provider.example/v1', { apiKey: 'dummy-saved-key' })
      assert.equal(result.hasApiKey, true)
      assert.equal(JSON.stringify(result).includes('dummy-saved-key'), false)
      const next = await save('https://PROVIDER.example:443/v1///')
      assert.equal(next.hasApiKey, true)
      const persisted = await disk()
      assert.equal(persisted.apiKey, 'dummy-saved-key')
      assert.equal('reuseApiKey' in persisted, false)
    })

    await t.test('meaningful endpoint changes reject without changing disk', async () => {
      const before = await disk()
      await expectConfirmationRequired(save('https://provider.example/v2'))
      assert.deepEqual(await disk(), before)
    })

    await t.test('explicit consent permits copying the saved key', async () => {
      const result = await save('https://provider.example/v2', { reuseApiKey: true })
      assert.equal(result.hasApiKey, true)
      assert.equal(JSON.stringify(result).includes('dummy-saved-key'), false)
      const persisted = await disk()
      assert.equal(persisted.apiKey, 'dummy-saved-key')
      assert.equal('reuseApiKey' in persisted, false)
    })

    await t.test('explicit replacement and empty keys take precedence', async () => {
      await save('https://provider.example/v3', { apiKey: 'dummy-new-key' })
      assert.equal((await disk()).apiKey, 'dummy-new-key')
      await save('https://provider.example/v4', { apiKey: '' })
      assert.equal((await disk()).apiKey, '')
      assert.equal((await settings.get()).apiKey, '')
    })

    await t.test('fresh keyless configuration saves without consent', async () => {
      const freshDirectory = await mkdtemp(path.join(tmpdir(), 'archway-provider-empty-'))
      try {
        assert.equal(path.dirname(freshDirectory), path.resolve(tmpdir()))
        const fresh = new ProviderSettings(freshDirectory)
        const result = await fresh.save({
          baseUrl: 'http://localhost:11434/v1',
          model: 'local-model',
        })
        assert.equal(result.hasApiKey, false)
        assert.equal((await fresh.get()).apiKey, '')
      } finally {
        await rm(freshDirectory, { recursive: true, force: true })
      }
    })

    await t.test('environment keys require confirmation at same or changed endpoints', async () => {
      await rm(path.join(directory, 'provider-settings.json'), { force: true })
      process.env.ARCHWAY_LLM_API_KEY = 'dummy-environment-key'
      process.env.ARCHWAY_LLM_BASE_URL = 'https://env-provider.example/v1'
      const beforeSame = await settings.get()
      assert.equal(beforeSame.source, 'environment')
      await expectConfirmationRequired(save('https://ENV-PROVIDER.example:443/v1/'))
      assert.deepEqual(await disk(), {})
      await expectConfirmationRequired(save('https://other-provider.example/v1'))
      assert.deepEqual(await disk(), {})
      await save('https://other-provider.example/v1', { apiKey: 'dummy-explicit-env-replacement' })
      assert.equal((await disk()).apiKey, 'dummy-explicit-env-replacement')
      await rm(path.join(directory, 'provider-settings.json'), { force: true })
      const accepted = await save('https://other-provider.example/v1', { reuseApiKey: true })
      assert.equal(accepted.hasApiKey, true)
      const persisted = await disk()
      assert.equal(persisted.apiKey, 'dummy-environment-key')
      assert.equal('reuseApiKey' in persisted, false)
    })
  } finally {
    for (const name of envNames) {
      const value = originalEnv[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
})

test('OpenAI-compatible planning uses chat completions and validates the returned plan', async () => {
  let received: any
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    received = { path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) }
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Add a read cache.',
                operations: [
                  {
                    op: 'add_component',
                    component: {
                      id: 'llm-cache',
                      kind: 'database',
                      name: 'LLM cache',
                      technology: 'Redis',
                    },
                  },
                ],
              }),
            },
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
      project = createProject()
    const plan = await planWithProvider(
      { baseUrl, model: 'test-model', apiKey: 'test-key', enabled: true, source: 'settings' },
      project,
      'Add a cache',
    )
    assert.equal(received.path, '/v1/chat/completions')
    assert.equal(received.authorization, 'Bearer test-key')
    assert.equal(received.body.model, 'test-model')
    assert.equal(plan.mode, 'provider')
    assert.ok(
      applyOperations(project, plan.operations).components.some((c) => c.id === 'llm-cache'),
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
