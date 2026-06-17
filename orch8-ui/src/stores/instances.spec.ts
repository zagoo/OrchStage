/**
 * Unit tests for useInstancesStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useInstancesStore } from './instances'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useInstancesStore', () => {
  describe('initial state', () => {
    it('has empty selection and blank filters', () => {
      const store = useInstancesStore()
      expect(store.hasSelection).toBe(false)
      expect(store.selectionCount).toBe(0)
      expect(store.filters.stateFilter).toBe('')
      expect(store.filters.namespace).toBe('')
      expect(store.filters.sequenceId).toBe('')
      expect(store.filters.search).toBe('')
    })
  })

  describe('toggleSelect()', () => {
    it('adds id to selection', () => {
      const store = useInstancesStore()
      store.toggleSelect('abc')
      expect(store.hasSelection).toBe(true)
      expect(store.selectionCount).toBe(1)
      expect(store.isSelected('abc')).toBe(true)
    })

    it('removes id when already selected', () => {
      const store = useInstancesStore()
      store.toggleSelect('abc')
      store.toggleSelect('abc')
      expect(store.hasSelection).toBe(false)
      expect(store.isSelected('abc')).toBe(false)
    })

    it('can select multiple ids', () => {
      const store = useInstancesStore()
      store.toggleSelect('a')
      store.toggleSelect('b')
      store.toggleSelect('c')
      expect(store.selectionCount).toBe(3)
    })
  })

  describe('selectAll()', () => {
    it('selects all provided ids', () => {
      const store = useInstancesStore()
      store.selectAll(['x', 'y', 'z'])
      expect(store.selectionCount).toBe(3)
      expect(store.isSelected('x')).toBe(true)
      expect(store.isSelected('y')).toBe(true)
      expect(store.isSelected('z')).toBe(true)
    })

    it('is additive — does not clear existing selection', () => {
      const store = useInstancesStore()
      store.toggleSelect('existing')
      store.selectAll(['new1', 'new2'])
      expect(store.isSelected('existing')).toBe(true)
      expect(store.selectionCount).toBe(3)
    })
  })

  describe('clearSelection()', () => {
    it('clears all selected ids', () => {
      const store = useInstancesStore()
      store.selectAll(['a', 'b', 'c'])
      store.clearSelection()
      expect(store.hasSelection).toBe(false)
      expect(store.selectionCount).toBe(0)
    })
  })

  describe('setFilter()', () => {
    it('updates the specified filter key', () => {
      const store = useInstancesStore()
      store.setFilter('namespace', 'prod')
      expect(store.filters.namespace).toBe('prod')
    })

    it('clears selection when a filter changes', () => {
      const store = useInstancesStore()
      store.selectAll(['a', 'b'])
      store.setFilter('stateFilter', 'running')
      expect(store.selectionCount).toBe(0)
    })

    it('can set stateFilter', () => {
      const store = useInstancesStore()
      store.setFilter('stateFilter', 'running,paused')
      expect(store.filters.stateFilter).toBe('running,paused')
    })

    it('can set search filter', () => {
      const store = useInstancesStore()
      store.setFilter('search', 'my-instance')
      expect(store.filters.search).toBe('my-instance')
    })
  })

  describe('resetFilters()', () => {
    it('resets all filters to empty and clears selection', () => {
      const store = useInstancesStore()
      store.setFilter('namespace', 'prod')
      store.setFilter('stateFilter', 'running')
      store.selectAll(['a'])
      store.resetFilters()
      expect(store.filters.namespace).toBe('')
      expect(store.filters.stateFilter).toBe('')
      expect(store.selectionCount).toBe(0)
    })
  })

  describe('stateFilterArray()', () => {
    it('returns undefined when stateFilter is empty', () => {
      const store = useInstancesStore()
      expect(store.stateFilterArray()).toBeUndefined()
    })

    it('returns array of states from comma-separated stateFilter', () => {
      const store = useInstancesStore()
      store.setFilter('stateFilter', 'running,paused,failed')
      expect(store.stateFilterArray()).toEqual(['running', 'paused', 'failed'])
    })

    it('handles whitespace-only stateFilter', () => {
      const store = useInstancesStore()
      store.setFilter('stateFilter', '   ')
      expect(store.stateFilterArray()).toBeUndefined()
    })

    it('filters out empty strings from split result', () => {
      const store = useInstancesStore()
      store.setFilter('stateFilter', 'running,')
      const result = store.stateFilterArray()
      expect(result).toEqual(['running'])
    })
  })

  describe('isSelected()', () => {
    it('returns false for non-selected id', () => {
      const store = useInstancesStore()
      expect(store.isSelected('nope')).toBe(false)
    })

    it('returns true for selected id', () => {
      const store = useInstancesStore()
      store.toggleSelect('yes')
      expect(store.isSelected('yes')).toBe(true)
    })
  })
})
