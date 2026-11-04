import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { planWithProvider } from '../server/provider'
import { createProject } from '../shared/templates'
import { applyOperations } from '../shared/model'

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
