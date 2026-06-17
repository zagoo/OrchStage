<script setup lang="ts">
/**
 * Sequence detail view.
 *
 * Features:
 *  - Load sequence by :id route param (GET /api/v1/sequences/{id})
 *  - 404 state + generic error state
 *  - PageHeader with name, version badge, SequenceStatusBadge, actions
 *    (SequenceActionsMenu + "Open in Canvas" button)
 *  - Panels: Metadata (KeyValue), Version history, Block tree (BlockTree),
 *    Input schema (CodeBlock), Raw definition JSON (CodeBlock)
 *
 * DESIGN_REFERENCE §Sequences (dag-sequences.md §9.2, §9.6)
 */
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Workflow, ExternalLink, AlertCircle, FileSearch } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useSequencesStore } from '@/stores/sequences'
import { useAsync } from '@/composables/useAsync'
import { getSequence, listSequenceVersions } from '@/api/sequences'
import { isApiError, errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { Component } from 'vue'

import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Panel from '@/components/ui/Panel.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import SequenceStatusBadge from '@/components/sequences/SequenceStatusBadge.vue'
import SequenceActionsMenu from '@/components/sequences/SequenceActionsMenu.vue'
import BlockTree from '@/components/sequences/BlockTree.vue'

const route  = useRoute()
const router = useRouter()
const ui     = useUiStore()
const seqStore = useSequencesStore()

const id = computed(() => route.params.id as string)

// --- sequence fetch ----------------------------------------------------------
const loader = useAsync((signal) => getSequence(id.value, signal))
const { data: seq, loading, error } = loader

const isNotFound = computed(() => isApiError(error.value) && error.value.status === 404)
const errorMsg   = computed(() => (error.value ? errorMessage(error.value) : ''))

// --- version history fetch ---------------------------------------------------
const versionsLoader = useAsync((signal) => {
  const s = seq.value
  if (!s) return Promise.resolve([])
  return listSequenceVersions(
    { tenant_id: s.tenant_id, namespace: s.namespace, name: s.name },
    signal,
  )
})
const { loading: versionsLoading } = versionsLoader

// Load sequence on mount and when :id changes
async function load() {
  seqStore.setCurrent(null)
  seqStore.clearVersions()
  const result = await loader.run()
  if (result) {
    seqStore.setCurrent(result)
    void versionsLoader.run().then((vs) => {
      if (vs) seqStore.setVersions(vs)
    })
  }
}

onMounted(load)
watch(id, load)

// Sync loader result back to store on every re-fetch
watch(seq, (s) => { if (s) seqStore.setCurrent(s) })

// --- actions -----------------------------------------------------------------
function openCanvas() {
  void router.push(`/canvas?sequence=${id.value}`)
}

function onChanged() {
  void load()
}

function onDeleted() {
  ui.success('Deleted', seq.value?.name ?? 'sequence')
  void router.push('/sequences')
}

// --- version table sort (newest-first by version number) --------------------
const sortedVersions = computed(() =>
  [...(seqStore.versions)].sort((a, b) => b.version - a.version),
)

// tone for version history badge
const versionTone = computed(() => {
  return (s: string) => {
    const map: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
      production: 'success',
      staging: 'info',
      draft: 'warning',
      unpublished: 'neutral',
    }
    return map[s] ?? 'neutral'
  }
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- 404 state -->
    <template v-if="isNotFound">
      <EmptyState
        :icon="FileSearch as Component"
        title="Sequence not found"
        description="This sequence does not exist or belongs to another tenant."
      >
        <template #action>
          <Button variant="primary" @click="router.push('/sequences')">Back to sequences</Button>
        </template>
      </EmptyState>
    </template>

    <!-- Generic error state -->
    <template v-else-if="error && !loading">
      <div
        class="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
        role="alert"
      >
        <AlertCircle :size="16" class="mt-0.5 shrink-0" />
        <div>
          <p class="font-semibold">Failed to load sequence</p>
          <p class="mt-0.5">{{ errorMsg }}</p>
          <button class="mt-2 underline" @click="load">Retry</button>
        </div>
      </div>
    </template>

    <!-- Loading skeleton -->
    <template v-else-if="loading && !seq">
      <div class="flex flex-col gap-4">
        <Skeleton height="3.5rem" />
        <Skeleton height="12rem" />
        <Skeleton height="8rem" />
      </div>
    </template>

    <!-- Loaded content -->
    <template v-else-if="seq">
      <!-- Page header -->
      <PageHeader
        :title="seq.name"
        :description="`${seq.namespace} · v${seq.version}`"
        :icon="Workflow"
      >
        <template #actions>
          <SequenceStatusBadge :status="seq.status" size="md" />

          <!-- Canvas link -->
          <Button variant="secondary" @click="openCanvas">
            <template #icon><ExternalLink :size="14" /></template>
            Open in Canvas
          </Button>

          <!-- Lifecycle actions -->
          <SequenceActionsMenu
            :sequence="seq"
            @changed="onChanged"
            @deleted="onDeleted"
          />
        </template>
      </PageHeader>

      <!-- Metadata + versions row -->
      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Metadata panel -->
        <Panel title="Metadata">
          <dl class="divide-y divide-border">
            <KeyValue label="ID">
              <span class="mono text-[12px]">{{ seq.id }}</span>
            </KeyValue>
            <KeyValue label="Tenant">
              <span class="mono text-[12px]">{{ seq.tenant_id }}</span>
            </KeyValue>
            <KeyValue label="Namespace">
              <span class="mono text-[12px]">{{ seq.namespace }}</span>
            </KeyValue>
            <KeyValue label="Version">
              <span class="mono">v{{ seq.version }}</span>
            </KeyValue>
            <KeyValue label="Deprecated">
              <span :class="seq.deprecated ? 'text-warning' : 'text-subtle'">
                {{ seq.deprecated ? 'Yes' : 'No' }}
              </span>
            </KeyValue>
            <KeyValue label="Created">
              <Tooltip :text="formatDateTime(seq.created_at)">
                <span>{{ formatRelative(seq.created_at) }}</span>
              </Tooltip>
            </KeyValue>
            <KeyValue v-if="seq.sla?.max_runtime != null" label="SLA max runtime">
              <span class="mono">{{ seq.sla.max_runtime }} ms</span>
            </KeyValue>
            <KeyValue v-if="seq.sla?.max_step_runtime != null" label="SLA max step">
              <span class="mono">{{ seq.sla.max_step_runtime }} ms</span>
            </KeyValue>
          </dl>
        </Panel>

        <!-- Version history panel -->
        <Panel title="Version History">
          <template #actions>
            <Badge tone="neutral">{{ sortedVersions.length }}</Badge>
          </template>

          <div v-if="versionsLoading" class="flex flex-col gap-2">
            <Skeleton v-for="n in 3" :key="n" height="2rem" />
          </div>

          <EmptyState
            v-else-if="sortedVersions.length === 0"
            title="No versions"
            description="Version history is unavailable."
            compact
          />

          <ul v-else class="divide-y divide-border">
            <li
              v-for="v in sortedVersions"
              :key="v.id"
              class="flex items-center justify-between gap-3 py-2"
            >
              <div class="flex items-center gap-2">
                <span class="mono text-[12px] font-semibold text-text">v{{ v.version }}</span>
                <Badge :tone="versionTone(v.status)" size="sm">{{ v.status }}</Badge>
                <span v-if="v.deprecated" class="text-[11px] text-warning">(deprecated)</span>
              </div>
              <div class="flex items-center gap-3">
                <Tooltip :text="formatDateTime(v.created_at)">
                  <span class="text-[11.5px] text-subtle">{{ formatRelative(v.created_at) }}</span>
                </Tooltip>
                <Button
                  v-if="v.id !== seq.id"
                  size="sm"
                  variant="ghost"
                  @click="router.push(`/sequences/${v.id}`)"
                >
                  View
                </Button>
                <Badge v-else tone="accent" size="sm">current</Badge>
              </div>
            </li>
          </ul>
        </Panel>
      </div>

      <!-- Block tree panel -->
      <Panel title="Block Tree">
        <template #actions>
          <Badge tone="neutral">{{ seq.blocks.length }} root block{{ seq.blocks.length !== 1 ? 's' : '' }}</Badge>
        </template>

        <EmptyState
          v-if="seq.blocks.length === 0"
          title="No blocks defined"
          description="This sequence has no blocks — it will fail validation."
          compact
        />
        <BlockTree v-else :blocks="seq.blocks" />

        <!-- on_failure cleanup blocks -->
        <template v-if="seq.on_failure?.length">
          <p class="mt-4 mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-danger/70">
            On Failure (cleanup — errors swallowed)
          </p>
          <BlockTree :blocks="seq.on_failure" />
        </template>

        <!-- on_cancel cleanup blocks -->
        <template v-if="seq.on_cancel?.length">
          <p class="mt-4 mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            On Cancel (cleanup — errors swallowed)
          </p>
          <BlockTree :blocks="seq.on_cancel" />
        </template>
      </Panel>

      <!-- Input schema panel -->
      <Panel
        v-if="seq.input_schema != null"
        title="Input Schema"
        subtitle="JSON Schema validated against context.data when creating instances."
      >
        <CodeBlock :content="seq.input_schema" language="json" :max-height="'320px'" />
      </Panel>

      <!-- Raw definition JSON panel -->
      <Panel
        title="Raw Definition"
        subtitle="Full SequenceDefinition JSON from the API."
      >
        <CodeBlock :content="seq" language="json" :max-height="'480px'" />
      </Panel>
    </template>
  </div>
</template>
