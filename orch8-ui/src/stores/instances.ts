/**
 * Instances domain store — selection state for multi-row batch operations.
 * The list data itself lives in the view's useAsync/usePolling composables.
 * DESIGN_REFERENCE §Instances
 */
import { defineStore } from 'pinia'
import type { InstanceState } from '@/api/types/instances'

export interface InstanceFilters {
  stateFilter: string       // comma-separated InstanceState values or ''
  namespace: string
  sequenceId: string
  search: string            // free-text id search
}

interface InstancesState {
  selectedIds: Set<string>
  filters: InstanceFilters
}

export const useInstancesStore = defineStore('instances', {
  state: (): InstancesState => ({
    selectedIds: new Set(),
    filters: {
      stateFilter: '',
      namespace: '',
      sequenceId: '',
      search: '',
    },
  }),

  getters: {
    hasSelection: (s) => s.selectedIds.size > 0,
    selectionCount: (s) => s.selectedIds.size,
  },

  actions: {
    toggleSelect(id: string): void {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id)
      } else {
        this.selectedIds.add(id)
      }
    },

    selectAll(ids: string[]): void {
      for (const id of ids) this.selectedIds.add(id)
    },

    clearSelection(): void {
      this.selectedIds.clear()
    },

    setFilter<K extends keyof InstanceFilters>(key: K, value: InstanceFilters[K]): void {
      this.filters[key] = value
      this.clearSelection()
    },

    resetFilters(): void {
      this.filters = { stateFilter: '', namespace: '', sequenceId: '', search: '' }
      this.clearSelection()
    },

    isSelected(id: string): boolean {
      return this.selectedIds.has(id)
    },

    stateFilterArray(): InstanceState[] | undefined {
      const s = this.filters.stateFilter.trim()
      if (!s) return undefined
      return s.split(',').filter(Boolean) as InstanceState[]
    },
  },
})
