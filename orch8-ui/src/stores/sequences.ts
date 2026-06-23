/**
 * Sequences domain store.
 * Holds the currently viewed sequence + version history, shared between
 * SequencesView (list) and SequenceDetailView (detail tabs).
 *
 * Also caches a flat sequence CATALOG (id → name/version/status) used wherever an
 * instance's `sequence_id` must be resolved to a human label: the Create Instance
 * picker, the Instances list/search, and the instance detail/overview. One fetch,
 * shared everywhere; re-fetched when the tenant changes or on an explicit force.
 */
import { defineStore } from 'pinia'
import { shallowRef, ref, computed } from 'vue'
import { listSequencesArray } from '@/api/sequences'
import { errorMessage } from '@/api/errors'
import type { SequenceDefinition } from '@/api/types/sequences'


export const useSequencesStore = defineStore('sequences', () => {
  const current = shallowRef<SequenceDefinition | null>(null)
  const versions = ref<SequenceDefinition[]>([])
  const versionsLoading = ref(false)
  const versionsError = ref<string | null>(null)

  function setCurrent(seq: SequenceDefinition | null) {
    current.value = seq
  }

  function setVersions(vs: SequenceDefinition[]) {
    versions.value = vs
  }

  function clearVersions() {
    versions.value = []
    versionsError.value = null
  }

  // --- shared catalog (id → name/version/status) -----------------------------
  // Time-to-live for the cache. Short enough that a sequence published elsewhere
  // shows up on the next catalog touch (the list poll, a remount); the points where
  // freshness is critical (the Create picker, a manual Refresh) pass `force` to
  // bypass it entirely.
  const CATALOG_TTL_MS = 60_000

  const catalog = ref<SequenceDefinition[]>([])
  const catalogLoading = ref(false)
  const catalogError = ref<string | null>(null)
  const catalogLoaded = ref(false)
  // The tenant the cached catalog belongs to, so a tenant switch refetches.
  const catalogTenant = ref<string | null>(null)
  // When the cache was last filled, for the TTL check above.
  const catalogFetchedAt = ref(0)

  const catalogById = computed(() => {
    const m = new Map<string, SequenceDefinition>()
    for (const s of catalog.value) m.set(s.id, s)
    return m
  })

  /**
   * Load the flat sequence catalog (≤1000 rows via /sequences.json). Cached with a
   * TTL: a repeat call is a no-op only while the cache is fresh AND for the same
   * tenant — unless `force` is set (e.g. opening the Create picker, where the list
   * MUST be authoritative). A stale cache (older than the TTL), a tenant switch, or
   * `force` all trigger a refetch, so a sequence published in another tab is picked
   * up without a full reload. Errors are stored in `catalogError`, never thrown —
   * the catalog only enriches display, so a failure degrades to raw ids.
   */
  async function loadCatalog(tenantId?: string | null, force = false): Promise<void> {
    const t = tenantId ?? null
    if (catalogLoading.value) return
    const fresh =
      catalogLoaded.value &&
      catalogTenant.value === t &&
      Date.now() - catalogFetchedAt.value < CATALOG_TTL_MS
    if (fresh && !force) return
    catalogLoading.value = true
    catalogError.value = null
    try {
      catalog.value = await listSequencesArray()
      catalogLoaded.value = true
      catalogTenant.value = t
      catalogFetchedAt.value = Date.now()
    } catch (e) {
      catalogError.value = errorMessage(e)
    } finally {
      catalogLoading.value = false
    }
  }

  /** Resolve a sequence by id from the cached catalog (undefined if unknown). */
  function sequenceById(id: string | null | undefined): SequenceDefinition | undefined {
    return id ? catalogById.value.get(id) : undefined
  }

  return {
    current,
    versions,
    versionsLoading,
    versionsError,
    setCurrent,
    setVersions,
    clearVersions,
    catalog,
    catalogLoading,
    catalogError,
    catalogLoaded,
    catalogById,
    loadCatalog,
    sequenceById,
  }
})
