import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

type ConnectionResult = { ok: true; model: string; latencyMs: number; checkedAt: string }

export function ProviderConnectionTest({ disabled = false }: { disabled?: boolean }) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ConnectionResult | null>(null)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const requestId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestId.current += 1
      controller.current?.abort()
      controller.current = null
    }
  }, [])

  async function runTest() {
    controller.current?.abort()
    const abortController = new AbortController()
    controller.current = abortController
    const id = ++requestId.current
    setPending(true)
    setResult(null)
    setError('')
    try {
      const response = await api<ConnectionResult>('/api/settings/provider/test', {
        method: 'POST',
        body: {},
        signal: abortController.signal,
      })
      if (mounted.current && requestId.current === id) setResult(response)
    } catch (cause) {
      if (!mounted.current || requestId.current !== id || abortController.signal.aborted) return
      const message = cause instanceof ApiError ? cause.message : (cause as Error).message
      setError(
        `${message} Check that the saved base URL, model name, and API key are correct, then save and try again.`,
      )
    } finally {
      if (mounted.current && requestId.current === id) {
        controller.current = null
        setPending(false)
      }
    }
  }

  function cancel() {
    requestId.current += 1
    controller.current?.abort()
    controller.current = null
    setPending(false)
    setError('Connection test cancelled.')
  }

  return (
    <section className="provider-connection-test" aria-label="Provider connection test">
      <p className="info-note">
        Save edits first. Testing makes a real, tiny inference request to the configured provider
        and may incur a charge.
      </p>
      <div className="modal-actions">
        <button
          className="button"
          type="button"
          onClick={() => void runTest()}
          disabled={disabled || pending}
        >
          {pending ? 'Testing saved connection…' : 'Test saved connection'}
        </button>
        {pending && (
          <button className="button" type="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      {result && (
        <p className="success-note" role="status">
          Connected to {result.model} in {result.latencyMs} ms.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
