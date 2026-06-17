/**
 * Unit tests for useSequencesStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSequencesStore } from './sequences'
import type { SequenceDefinition } from '@/api/types/sequences'

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
})
