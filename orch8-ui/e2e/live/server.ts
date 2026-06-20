/**
 * Live E2E harness.
 *
 * Points the REAL HTTP client (src/api/http.ts) at a running orch8-server and
 * gates the whole suite on reachability, so `npm run test:e2e` degrades to a
 * clean skip when the server is down instead of a wall of failures.
 *
 * The client talks DIRECTLY to the server here (Node `fetch`, no browser, so no
 * CORS) — `baseUrl` is the absolute server origin. Override with ORCH8_E2E_URL.
 */
import { http, setHttpConfig } from '@/api/http'
import { deleteSequence } from '@/api/sequences'

export const SERVER_URL = process.env.ORCH8_E2E_URL ?? 'http://localhost:8080'
export const TENANT = 'acme'
export const NAMESPACE = 'default'

// The live server is in insecure/dev mode (empty securitySchemes) — no key needed.
setHttpConfig({ baseUrl: SERVER_URL, apiKey: null, tenantId: null })

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health/ready`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/** Resolved once at import; specs use `describe.skipIf(!SERVER_UP)`. */
export const SERVER_UP = await probe()
if (!SERVER_UP) {
  // eslint-disable-next-line no-console
  console.warn(
    `\n[e2e] orch8-server unreachable at ${SERVER_URL} — live specs skipped.\n` +
      `      Start the server (or set ORCH8_E2E_URL) and re-run \`npm run test:e2e\`.\n`,
  )
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Best-effort cleanup of sequences a spec creates (instances aren't deletable). */
export function tracker(): { addId: (id: string) => string; cleanup: () => Promise<void> } {
  const ids: string[] = []
  return {
    addId(id) {
      ids.push(id)
      return id
    },
    async cleanup() {
      for (const id of ids.splice(0)) {
        try {
          await deleteSequence(id)
        } catch {
          /* already gone */
        }
      }
    },
  }
}

/** Untyped POST for negative/contract probes (deliberately bypasses UI types). */
export function rawPost(path: string, body: unknown): Promise<unknown> {
  return http.post(path, body)
}
