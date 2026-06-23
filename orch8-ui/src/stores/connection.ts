/**
 * Connection store — owns the orch8-server endpoint + auth credentials and
 * mirrors them into the HTTP client. Persisted to localStorage so an operator
 * keeps their session across reloads. Route guards read `configured` to gate
 * the app behind a connection setup screen.
 */
import { defineStore } from 'pinia'
import { http } from '@/api/http'
import { setHttpConfig } from '@/api/http'
import { errorMessage } from '@/api/errors'

const STORAGE_KEY = 'orch8.connection.v1'

type ConnStatus = 'unknown' | 'checking' | 'ok' | 'error'

interface PersistedConn {
  baseUrl: string
  apiKey: string
  tenantId: string
  insecure: boolean
}

interface ConnectionState extends PersistedConn {
  status: ConnStatus
  info: Record<string, unknown> | null
  lastError: string | null
  lastCheckedAt: number | null
}

export const useConnectionStore = defineStore('connection', {
  state: (): ConnectionState => ({
    baseUrl: '',
    apiKey: '',
    tenantId: '',
    insecure: false,
    status: 'unknown',
    info: null,
    lastError: null,
    lastCheckedAt: null,
  }),

  getters: {
    /** Ready to talk to the API: either a key is set or insecure dev mode. */
    configured: (s): boolean => s.insecure || s.apiKey.trim().length > 0,
    hasTenant: (s): boolean => s.tenantId.trim().length > 0,
    engineVersion: (s): string => {
      const v = s.info?.version
      return typeof v === 'string' ? v : '—'
    },
    /** Operator-set environment label from GET /info (ORCH8_ENV_LABEL), or null. */
    envLabel: (s): string | null => {
      const v = s.info?.env_label
      return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
    },
    /** Operator-set environment color from GET /info (ORCH8_ENV_COLOR), or null. */
    envColor: (s): string | null => {
      const v = s.info?.env_color
      return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
    },
  },

  actions: {
    apply(): void {
      setHttpConfig({
        baseUrl: this.baseUrl.trim(),
        apiKey: this.apiKey.trim() || null,
        tenantId: this.tenantId.trim() || null,
      })
    },

    hydrate(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const p = JSON.parse(raw) as Partial<PersistedConn>
          this.baseUrl = p.baseUrl ?? ''
          this.apiKey = p.apiKey ?? ''
          this.tenantId = p.tenantId ?? ''
          this.insecure = p.insecure ?? false
        }
      } catch {
        /* ignore corrupt storage */
      }
      this.apply()
    },

    persist(): void {
      const p: PersistedConn = {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        tenantId: this.tenantId,
        insecure: this.insecure,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
      } catch {
        /* storage may be unavailable */
      }
    },

    setConnection(patch: Partial<PersistedConn>): void {
      Object.assign(this, patch)
      this.apply()
      this.persist()
    },

    clear(): void {
      this.baseUrl = ''
      this.apiKey = ''
      this.tenantId = ''
      this.insecure = false
      this.status = 'unknown'
      this.info = null
      this.lastError = null
      this.apply()
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* noop */
      }
    },

    /**
     * Fetch the unauthenticated /info (engine version + environment banner)
     * without touching connection status. Safe to call on app boot; failures
     * are swallowed because /info is cosmetic chrome, not a health signal.
     */
    async loadInfo(): Promise<void> {
      try {
        this.info = await http.get<Record<string, unknown>>('/info')
      } catch {
        /* /info is best-effort; ignore */
      }
    },

    /** Probe /health/ready then /info to validate credentials + reachability. */
    async check(): Promise<boolean> {
      this.status = 'checking'
      this.lastError = null
      try {
        await http.get<unknown>('/health/ready')
        this.info = await http.get<Record<string, unknown>>('/info').catch(() => null)
        this.status = 'ok'
        this.lastCheckedAt = Date.now()
        return true
      } catch (err) {
        this.status = 'error'
        this.lastError = errorMessage(err)
        this.lastCheckedAt = Date.now()
        return false
      }
    },
  },
})
