<script setup lang="ts" generic="T">
import { cn } from '@/lib/cn'
import Skeleton from './Skeleton.vue'
import EmptyState from './EmptyState.vue'

export interface Column {
  key: string
  header: string
  width?: string
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  class?: string
}

withDefaults(
  defineProps<{
    columns: Column[]
    rows: T[]
    rowKey: (row: T) => string
    loading?: boolean
    clickable?: boolean
    emptyTitle?: string
    emptyDescription?: string
    skeletonRows?: number
  }>(),
  { loading: false, clickable: false, skeletonRows: 6 },
)

const emit = defineEmits<{ rowClick: [row: T] }>()

function cell(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}
const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' } as const
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border">
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="border-b border-border bg-surface-2">
          <th
            v-for="col in columns"
            :key="col.key"
            :class="cn('whitespace-nowrap px-3.5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-subtle', alignCls[col.align ?? 'left'])"
            :style="col.width ? { width: col.width } : undefined"
            scope="col"
          >
            <slot :name="`head-${col.key}`">{{ col.header }}</slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr v-for="n in skeletonRows" :key="`sk-${n}`" class="border-b border-border last:border-0">
            <td v-for="col in columns" :key="col.key" class="px-3.5 py-3">
              <Skeleton :width="col.align === 'right' ? '40%' : '70%'" height="0.85rem" />
            </td>
          </tr>
        </template>
        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length" class="p-0">
            <EmptyState :title="emptyTitle ?? 'No records'" :description="emptyDescription" compact />
          </td>
        </tr>
        <tr
          v-for="row in rows"
          v-else
          :key="rowKey(row)"
          :class="cn('border-b border-border last:border-0 transition-colors', clickable ? 'cursor-pointer hover:bg-hover' : 'hover:bg-surface-2/60')"
          @click="clickable && emit('rowClick', row)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            :class="cn('px-3.5 py-2.5 align-middle text-text', alignCls[col.align ?? 'left'], col.mono && 'mono text-[12px]', col.class)"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="cell(row, col.key)">
              {{ cell(row, col.key) ?? '—' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
