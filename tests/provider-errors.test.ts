import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { contentOf, ModelError, type Project } from '../shared/model'
import { createProject } from '../shared/templates'
import { planWithProvider, testProviderConnection, type ProviderConfig } from '../server/provider'

type ChatBody = { model?: string; messages?: { role: string; content: string }[] }
type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: ChatBody,
) => unknown | Promise<unknown>

const configFor = (baseUrl: string, enabled = true): ProviderConfig => ({
  baseUrl,
  model: 'synthetic-test-model',
  apiKey: 'synthetic-test-key',
  enabled,
  source: 'settings',
})

async function withMockProvider<T>(
  handler: Handler,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((req, res) => {
    void (async () => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      await handler(req, res, JSON.parse(raw) as ChatBody)
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try {
    return await run(`http://127.0.0.1:${address.port}/v1`)
  } finally {
    server.closeAllConnections()
    await closeServer(server)
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

function sendJson(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

function completion(content: unknown) {
  return { choices: [{ message: { content } }] }
}

async function expectModelError(
  promise: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ModelError)
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    assert.equal(error.message.includes('synthetic-test-key'), false)
    return true
  })
}

const project: Project = createProject()

test('provider HTTP failures, including authentication errors, become sanitized 502 errors', async () => {
  await withMockProvider(
    (_req, res) => res.writeHead(401).end('synthetic-test-key rejected'),
    async (baseUrl) =>
      expectModelError(
        planWithProvider(configFor(baseUrl), project, 'Add a service'),
        'PROVIDER_ERROR',
        502,
      ),
  )
})

test('unreachable providers become sanitized 502 errors', async () => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await closeServer(server)
  await expectModelError(
    planWithProvider(configFor(`http://127.0.0.1:${address.port}/v1`), project, 'Add a service'),
    'PROVIDER_UNREACHABLE',
    502,
  )
})

test('malformed outer JSON and unexpected root shapes are handled as provider errors', async (t) => {
  for (const [name, write] of [
    ['invalid JSON', (res: ServerResponse) => res.writeHead(200).end('{not json')],
    ['null root', (res: ServerResponse) => sendJson(res, null)],
    ['array root', (res: ServerResponse) => sendJson(res, [])],
    [
      'no text',
      (res: ServerResponse) => sendJson(res, { choices: [{ message: { content: null } }] }),
    ],
  ] as const) {
    await t.test(name, async () => {
      await withMockProvider(
        (_req, res) => write(res),
        async (baseUrl) =>
          expectModelError(
            planWithProvider(configFor(baseUrl), project, 'Add a service'),
            'PROVIDER_INVALID_RESPONSE',
            502,
          ),
      )
    })
  }
})

test('invalid and prohibited model plans are rejected with 422', async (t) => {
  const cases: [string, string][] = [
    ['invalid plan JSON', '{not json'],
    ['invalid plan schema', JSON.stringify({ summary: 'missing operations' })],
    [
      'prohibited operation',
      JSON.stringify({
        summary: 'Replace all content',
        operations: [{ op: 'replace_content', content: contentOf(project) }],
      }),
    ],
  ]
  for (const [name, content] of cases) {
    await t.test(name, async () => {
      await withMockProvider(
        (_req, res) => sendJson(res, completion(content)),
        async (baseUrl) =>
          expectModelError(
            planWithProvider(configFor(baseUrl), project, 'Change the architecture'),
            name === 'prohibited operation' ? 'PLAN_TOO_BROAD' : 'PLAN_INVALID',
            422,
          ),
      )
    })
  }
})

test('a slow response body is bounded by the injected timeout', async () => {
  await withMockProvider(
    (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"choices":[')
      const timer = setTimeout(() => res.end(']}'), 500)
      res.once('close', () => clearTimeout(timer))
    },
    async (baseUrl) =>
      expectModelError(
        planWithProvider(configFor(baseUrl), project, 'Add a service', { timeoutMs: 30 }),
        'PROVIDER_TIMEOUT',
        504,
      ),
  )
})

test('caller abort is distinct from timeout', async () => {
  await withMockProvider(
    (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"choices":[')
      const timer = setTimeout(() => res.end(']}'), 500)
      res.once('close', () => clearTimeout(timer))
    },
    async (baseUrl) => {
      const controller = new AbortController()
      const request = planWithProvider(configFor(baseUrl), project, 'Add a service', {
        signal: controller.signal,
        timeoutMs: 1000,
      })
      setTimeout(() => controller.abort(), 25)
      await expectModelError(request, 'PROVIDER_CANCELLED', 499)
    },
  )
})

test('connection testing requires enabled configuration and validates a real synthetic exchange', async (t) => {
  await t.test('disabled provider is rejected', async () => {
    await expectModelError(
      testProviderConnection(configFor('http://127.0.0.1:1/v1', false)),
      'PROVIDER_NOT_CONFIGURED',
      400,
    )
  })
  await t.test('valid JSON protocol response reports model and timing', async () => {
    await withMockProvider(
      (_req, res, body) => {
        assert.equal(body.model, 'synthetic-test-model')
        assert.equal(
          body.messages?.some((message) => message.content.includes('architecture:')),
          false,
        )
        sendJson(res, completion('{"ok":true}'))
      },
      async (baseUrl) => {
        const result = await testProviderConnection(configFor(baseUrl))
        assert.equal(result.ok, true)
        assert.equal(result.model, 'synthetic-test-model')
        assert.ok(Number.isFinite(result.latencyMs) && result.latencyMs >= 0)
        assert.ok(Number.isFinite(Date.parse(result.checkedAt)))
      },
    )
  })
  await t.test('malformed protocol response does not report success', async () => {
    await withMockProvider(
      (_req, res) => sendJson(res, completion('{"ok":false}')),
      async (baseUrl) =>
        expectModelError(
          testProviderConnection(configFor(baseUrl)),
          'PROVIDER_INVALID_RESPONSE',
          502,
        ),
    )
  })
  await t.test('provider HTTP failure does not report success', async () => {
    await withMockProvider(
      (_req, res) => res.writeHead(503).end(),
      async (baseUrl) =>
        expectModelError(testProviderConnection(configFor(baseUrl)), 'PROVIDER_ERROR', 502),
    )
  })
})
