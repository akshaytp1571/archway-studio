/**
 * Normalize a provider base URL for credential-reuse equality checks only.
 * Provider request URLs continue to use the configured base URL unchanged.
 */
export function normalizeProviderBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return baseUrl.trim()
  }
}
