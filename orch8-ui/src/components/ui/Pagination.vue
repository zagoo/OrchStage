<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Button from './Button.vue'

const props = withDefaults(
  defineProps<{ limit: number; offset: number; count: number; total?: number | null; loading?: boolean }>(),
  { total: null, loading: false },
)
const emit = defineEmits<{ 'update:offset': [value: number] }>()

const from = computed(() => (props.count === 0 ? 0 : props.offset + 1))
const to = computed(() => props.offset + props.count)
const hasPrev = computed(() => props.offset > 0)
const hasNext = computed(() =>
  props.total != null ? to.value < props.total : props.count >= props.limit,
)

function prev() {
  if (hasPrev.value) emit('update:offset', Math.max(0, props.offset - props.limit))
}
function next() {
  if (hasNext.value) emit('update:offset', props.offset + props.limit)
}
</script>

<template>
  <div class="flex items-center justify-between gap-3 text-[12.5px] text-subtle">
    <span class="tabular-nums">
      <template v-if="total != null">{{ from }}–{{ to }} of {{ total }}</template>
      <template v-else>Showing {{ from }}–{{ to }}</template>
    </span>
    <div class="flex items-center gap-1.5">
      <Button size="sm" variant="secondary" :disabled="!hasPrev || loading" @click="prev">
        <template #icon><ChevronLeft :size="15" /></template>
        Prev
      </Button>
      <Button size="sm" variant="secondary" :disabled="!hasNext || loading" @click="next">
        Next
        <ChevronRight :size="15" />
      </Button>
    </div>
  </div>
</template>
