/**
 * Unit tests for useSequencesStore.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSequencesStore } from './sequences'
import { listSequencesArray } from '@/api/sequences'
import type { SequenceDefinition } from '@/api/types/sequences'

// The catalog loader hits /sequences.json — mock it so we can assert caching/lookup
// without a network. errorMessage() is exercised by the failure case.
vi.mock('@/api/sequences', () => ({ listSequencesArray: vi.fn() }))
const listMock = vi.mocked(listSequencesArray)

function makeSeq(id = 'seq-1', name = 'My Sequence'): SequenceDefinition {
  return {
    id,
    name,
    version: 1,
    status: 'production',
    tenant_id: 'tenant-a',
    namespace: 'default',
    description: null,
    deprecated: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    blocks: [],
    tags: [],
    metadata: null,
  } as unknown as SequenceDefinition
}

beforeEach(() => {
  setActivePinia(createPinia())
  listMock.mockReset()
})

describe('useSequencesStore', () => {
  describe('initial state', () => {
    it('current is null, versions empty', () => {
      const store = useSequencesStore()
      expect(store.current).toBeNull()
      expect(store.versions).toEqual([])
      expect(store.versionsLoading).toBe(false)
      expect(store.versionsError).toBeNull()
    })
  })

  describe('setCurrent()', () => {
    it('sets the current sequence', () => {
      const store = useSequencesStore()
      const seq = makeSeq()
      store.setCurrent(seq)
      expect(store.current).toEqual(seq)
      expect(store.current?.id).toBe('seq-1')
    })

    it('can clear current to null', () => {
      const store = useSequencesStore()
      store.setCurrent(makeSeq())
      store.setCurrent(null)
      expect(store.current).toBeNull()
    })
  })

  describe('setVersions()', () => {
    it('stores the provided version list', () => {
      const store = useSequencesStore()
      const vs = [makeSeq('seq-1', 'v1'), makeSeq('seq-1', 'v2')]
      store.setVersions(vs)
      expect(store.versions).toHaveLength(2)
      expect(store.versions[0].name).toBe('v1')
      expect(store.versions[1].name).toBe('v2')
    })
  })

  describe('clearVersions()', () => {
    it('empties versions and clears versionsError', () => {
      const store = useSequencesStore()
      store.setVersions([makeSeq()])
      store.versionsError = 'something went wrong'

      store.clearVersions()

      expect(store.versions).toEqual([])
      expect(store.versionsError).toBeNull()
    })
  })

  describe('versionsLoading and versionsError', () => {
    it('can be set directly as reactive refs', () => {
      const store = useSequencesStore()
      store.versionsLoading = true
      store.versionsError = 'load failed'
      expect(store.versionsLoading).toBe(true)
      expect(store.versionsError).toBe('load failed')
    })
  })

  describe('catalog (sequence id → name/version/status)', () => {
    it('loadCatalog fetches once and builds the id lookup', async () => {
      const seqs = [makeSeq('id-a', 'alpha'), makeSeq('id-b', 'beta')]
      listMock.mockResolvedValue(seqs)
      const store = useSequencesStore()

      await store.loadCatalog('tenant-a')

      expect(listMock).toHaveBeenCalledTimes(1)
      expect(store.catalog).toHaveLength(2)
      expect(store.catalogLoaded).toBe(true)
      expect(store.sequenceById('id-b')?.name).toBe('beta')
      expect(store.sequenceById('missing')).toBeUndefined()
      expect(store.sequenceById(null)).toBeUndefined()
    })

    it('caches: a second call for the same tenant does NOT refetch', async () => {
      listMock.mockResolvedValue([makeSeq()])
      const store = useSequencesStore()
      await store.loadCatalog('tenant-a')
      await store.loadCatalog('tenant-a')
      expect(listMock).toHaveBeenCalledTimes(1)
    })

    it('refetches when the tenant changes or force is set', async () => {
      listMock.mockResolvedValue([makeSeq()])
      const store = useSequencesStore()
      await store.loadCatalog('tenant-a')
      await store.loadCatalog('tenant-b') // different tenant → reload
      await store.loadCatalog('tenant-b', true) // force → reload
      expect(listMock).toHaveBeenCalledTimes(3)
    })

    it('refetches once the cache TTL (60s) has elapsed — no stale catalog after idle', async () => {
      // Simulates the "left the page for half an hour, then came back" case: a
      // cached catalog older than the TTL must refetch on the next touch.
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
      listMock.mockResolvedValue([makeSeq('id-a', 'v1-only')])
      const store = useSequencesStore()

      await store.loadCatalog('tenant-a') // fetch #1
      await store.loadCatalog('tenant-a') // fresh (same instant) → cached, still 1
      expect(listMock).toHaveBeenCalledTimes(1)

      nowSpy.mockReturnValue(1_000_000 + 61_000) // +61s → past the 60s TTL
      await store.loadCatalog('tenant-a') // stale → fetch #2
      expect(listMock).toHaveBeenCalledTimes(2)

      nowSpy.mockRestore()
    })

    it('degrades gracefully on error — records catalogError, leaves catalog empty', async () => {
      listMock.mockRejectedValue(new Error('boom'))
      const store = useSequencesStore()
      await store.loadCatalog('tenant-a')
      expect(store.catalog).toEqual([])
      expect(store.catalogError).toBeTruthy()
      expect(store.catalogLoaded).toBe(false)
    })
  })
})
