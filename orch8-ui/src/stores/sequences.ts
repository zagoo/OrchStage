/**
 * Sequences domain store.
 * Holds the currently viewed sequence + version history, shared between
 * SequencesView (list) and SequenceDetailView (detail tabs).
 */
import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'
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

  return {
    current,
    versions,
    versionsLoading,
    versionsError,
    setCurrent,
    setVersions,
    clearVersions,
  }
})
