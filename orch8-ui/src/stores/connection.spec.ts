/**
 * Unit tests for useConnectionStore.
 * Stubs global fetch; uses setActivePinia(createPinia()) per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from './connection'

const STORAGE_KEY = 'orch8.connection.v1'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useConnectionStore', () => {
  describe('hydrate()', () => {
    it('reads persisted data from localStorage and applies config', () => {
      const stored = { baseUrl: 'http://localhost:8080', apiKey: 'key-abc', tenantId: 'tenant-1', insecure: false }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

      const store = useConnectionStore()
      store.hydrate()

      expect(store.baseUrl).toBe('http://localhost:8080')
      expect(store.apiKey).toBe('key-abc')
      expect(store.tenantId).toBe('tenant-1')
    })

    it('handles missing localStorage gracefully', () => {
      const store = useConnectionStore()
      store.hydrate()
      expect(store.baseUrl).toBe('')
      expect(store.apiKey).toBe('')
    })

    it('handles corrupt localStorage data without throwing', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json{{{')
      const store = useConnectionStore()
      expect(() => store.hydrate()).not.toThrow()
      expect(store.baseUrl).toBe('')
    })

    it('applies partial persisted data (missing fields default to empty string)', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: 'http://example.com' }))
      const store = useConnectionStore()
      store.hydrate()
      expect(store.baseUrl).toBe('http://example.com')
      expect(store.apiKey).toBe('')
      expect(store.tenantId).toBe('')
    })
  })

  describe('setConnection()', () => {
    it('persists values to localStorage and updates state', () => {
      const store = useConnectionStore()
      store.setConnection({ baseUrl: 'http://server:9000', apiKey: 'my-key', tenantId: 't1', insecure: false })

      expect(store.baseUrl).toBe('http://server:9000')
      expect(store.apiKey).toBe('my-key')

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(saved.baseUrl).toBe('http://server:9000')
      expect(saved.apiKey).toBe('my-key')
    })

    it('partial patch only updates provided fields', () => {
      const store = useConnectionStore()
      store.setConnection({ baseUrl: 'http://a.com', apiKey: 'k1', tenantId: '', insecure: false })
      store.setConnection({ apiKey: 'k2' })
      expect(store.baseUrl).toBe('http://a.com')
      expect(store.apiKey).toBe('k2')
    })
  })

  describe('configured getter', () => {
    it('returns false when no apiKey and not insecure', () => {
      const store = useConnectionStore()
      expect(store.configured).toBe(false)
    })

    it('returns true when apiKey is set', () => {
      const store = useConnectionStore()
      store.setConnection({ apiKey: 'secret-key' })
      expect(store.configured).toBe(true)
    })

    it('returns true when insecure=true even without apiKey', () => {
      const store = useConnectionStore()
      store.setConnection({ insecure: true, apiKey: '' })
      expect(store.configured).toBe(true)
    })

    it('returns false when apiKey is whitespace only', () => {
      const store = useConnectionStore()
      store.setConnection({ apiKey: '   ', insecure: false })
      expect(store.configured).toBe(false)
    })
  })

  describe('check() — success', () => {
    it('sets status="ok" and captures info on success', async () => {
      const infoPayload = { version: '2.0.0', name: 'orch8' }
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: () => Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: () => Promise.resolve(JSON.stringify(infoPayload)),
        })
      )

      const store = useConnectionStore()
      const result = await store.check()

      expect(result).toBe(true)
      expect(store.status).toBe('ok')
      expect(store.info).toEqual(infoPayload)
      expect(store.lastCheckedAt).not.toBeNull()
      expect(store.lastError).toBeNull()
    })
  })

  describe('check() — failure', () => {
    it('sets status="error" and lastError on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        text: () => Promise.resolve('service unavailable'),
      }))

      const store = useConnectionStore()
      const result = await store.check()

      expect(result).toBe(false)
      expect(store.status).toBe('error')
      expect(store.lastError).toBeTruthy()
      expect(store.lastCheckedAt).not.toBeNull()
    })

    it('sets status="error" when fetch throws a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

      const store = useConnectionStore()
      const result = await store.check()

      expect(result).toBe(false)
      expect(store.status).toBe('error')
      expect(store.lastError).toContain('Failed to fetch')
    })
  })

  describe('clear()', () => {
    it('resets all state and removes localStorage entry', () => {
      const store = useConnectionStore()
      store.setConnection({ baseUrl: 'http://x.com', apiKey: 'k', tenantId: 't1', insecure: false })
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

      store.clear()

      expect(store.baseUrl).toBe('')
      expect(store.apiKey).toBe('')
      expect(store.tenantId).toBe('')
      expect(store.insecure).toBe(false)
      expect(store.status).toBe('unknown')
      expect(store.info).toBeNull()
      expect(store.lastError).toBeNull()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('hasTenant getter', () => {
    it('returns false when tenantId is empty', () => {
      const store = useConnectionStore()
      expect(store.hasTenant).toBe(false)
    })

    it('returns true when tenantId is set', () => {
      const store = useConnectionStore()
      store.setConnection({ tenantId: 'my-tenant' })
      expect(store.hasTenant).toBe(true)
    })
  })

  describe('engineVersion getter', () => {
    it('returns "—" when info is null', () => {
      const store = useConnectionStore()
      expect(store.engineVersion).toBe('—')
    })

    it('returns version string from info', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), text: () => Promise.resolve('') })
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), text: () => Promise.resolve(JSON.stringify({ version: '1.2.3' })) })
      )
      const store = useConnectionStore()
      await store.check()
      expect(store.engineVersion).toBe('1.2.3')
    })
  })

  describe('env banner getters (env_label / env_color)', () => {
    it('return null when info is null or the fields are absent/blank', () => {
      const store = useConnectionStore()
      expect(store.envLabel).toBeNull()
      expect(store.envColor).toBeNull()
      store.info = { version: '1.0.0', env_label: '   ', env_color: '' }
      expect(store.envLabel).toBeNull()
      expect(store.envColor).toBeNull()
    })

    it('expose trimmed env_label / env_color from info', () => {
      const store = useConnectionStore()
      store.info = { env_label: ' PRODUCTION ', env_color: '#b91c1c' }
      expect(store.envLabel).toBe('PRODUCTION')
      expect(store.envColor).toBe('#b91c1c')
    })
  })

  describe('loadInfo()', () => {
    it('fetches /info into info without changing connection status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify({ version: '2.0.0', env_label: 'STAGING' })),
      }))
      const store = useConnectionStore()
      await store.loadInfo()
      expect(store.info).toEqual({ version: '2.0.0', env_label: 'STAGING' })
      expect(store.envLabel).toBe('STAGING')
      expect(store.status).toBe('unknown') // loadInfo must not flip connection status
    })

    it('swallows /info failures (best-effort chrome)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('boom')))
      const store = useConnectionStore()
      await store.loadInfo()
      expect(store.info).toBeNull()
    })
  })
})
