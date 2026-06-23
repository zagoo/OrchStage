<script setup lang="ts">
/**
 * Custom listbox dropdown — the shared styled Select. Per CLAUDE.md Rule 7 / DESIGN.md
 * "Dropdowns / Select controls", we NEVER use a native `<select>`: native `<option>`
 * popups can't be styled and clip inside `overflow:auto` drawers/modals.
 *
 * - Trigger matches the text input (Input.vue) exactly.
 * - Popup is teleported to <body>, position computed from the trigger rect (flips above
 *   when space below is tight), so it escapes the drawer's overflow clipping.
 * - Options are borderless rows with hover/active highlight + a check on the selected row.
 * - Full keyboard + ARIA parity with a native select (combobox + listbox semantics).
 *
 * API is unchanged from the previous native version: v-model<string>, options, placeholder,
 * invalid, disabled, class, id.
 */
import { computed, ref, nextTick, onBeforeUnmount, useId, watch, type CSSProperties } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** Arbitrary payload for rich rows — read it back via the `option`/`value` slots. */
  data?: unknown
}

const props = withDefaults(
  defineProps<{
    id?: string
    options?: SelectOption[]
    placeholder?: string
    invalid?: boolean
    disabled?: boolean
    class?: string
  }>(),
  { invalid: false, disabled: false },
)
const model = defineModel<string>()

const uid = useId()
const listboxId = `${uid}-listbox`
const optionId = (i: number) => `${uid}-opt-${i}`

const opts = computed<SelectOption[]>(() => props.options ?? [])
const selected = computed(() => opts.value.find((o) => o.value === model.value) ?? null)

const open = ref(false)
const activeIndex = ref(-1)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popupRef = ref<HTMLElement | null>(null)
const popupStyle = ref<CSSProperties>({})

const triggerCls = computed(() =>
  cn(
    'flex h-9 w-full items-center gap-2 rounded-md border bg-surface-2 px-3 text-[13px] text-text transition-colors focus:outline-none',
    open.value ? 'border-accent bg-surface' : props.invalid ? 'border-danger' : 'border-border-strong hover:border-faint',
    props.disabled && 'cursor-not-allowed opacity-60',
    props.class,
  ),
)

function optionCls(o: SelectOption, i: number): string {
  return cn(
    'flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] transition-colors',
    o.disabled
      ? 'cursor-not-allowed text-faint'
      : i === activeIndex.value
        ? 'bg-accent-soft text-text'
        : 'text-text hover:bg-hover',
    o.value === model.value && 'font-semibold text-accent',
  )
}

/** First non-disabled index scanning from `from` in direction `dir` (then anywhere). */
function firstEnabled(from = 0, dir: 1 | -1 = 1): number {
  const n = opts.value.length
  for (let i = from; i >= 0 && i < n; i += dir) if (!opts.value[i]?.disabled) return i
  for (let i = 0; i < n; i++) if (!opts.value[i]?.disabled) return i
  return -1
}

function reposition() {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const spaceBelow = vh - r.bottom
  const spaceAbove = r.top
  const placeAbove = spaceBelow < 200 && spaceAbove > spaceBelow
  const maxHeight = `${Math.max(140, Math.min(300, (placeAbove ? spaceAbove : spaceBelow) - 12))}px`
  const base: CSSProperties = { position: 'fixed', left: `${r.left}px`, width: `${r.width}px`, maxHeight }
  popupStyle.value = placeAbove ? { ...base, bottom: `${vh - r.top + 4}px` } : { ...base, top: `${r.bottom + 4}px` }
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const el = popupRef.value?.querySelector(`[data-idx="${activeIndex.value}"]`)
    // optional-call: jsdom (unit tests) doesn't implement scrollIntoView
    ;(el as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' })
  })
}

async function openMenu() {
  if (props.disabled || open.value) return
  open.value = true
  const selIdx = opts.value.findIndex((o) => o.value === model.value && !o.disabled)
  activeIndex.value = selIdx >= 0 ? selIdx : firstEnabled()
  await nextTick()
  reposition()
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
  document.addEventListener('mousedown', onDocPointer, true)
  scrollActiveIntoView()
}

function closeMenu(focusTrigger = true) {
  if (!open.value) return
  open.value = false
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
  document.removeEventListener('mousedown', onDocPointer, true)
  if (focusTrigger) triggerRef.value?.focus()
}

function toggle() {
  if (open.value) closeMenu()
  else void openMenu()
}

function onDocPointer(e: MouseEvent) {
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || popupRef.value?.contains(t)) return
  closeMenu(false)
}

function selectAt(i: number) {
  const o = opts.value[i]
  if (!o || o.disabled) return
  model.value = o.value
  closeMenu()
}

function moveActive(dir: 1 | -1) {
  const n = opts.value.length
  if (n === 0) return
  let i = activeIndex.value
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n
    if (!opts.value[i]?.disabled) {
      activeIndex.value = i
      break
    }
  }
  scrollActiveIntoView()
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      void openMenu()
    }
    return
  }
  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      closeMenu()
      break
    case 'Tab':
      closeMenu(false)
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (activeIndex.value >= 0) selectAt(activeIndex.value)
      break
    case 'ArrowDown':
      e.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      e.preventDefault()
      activeIndex.value = firstEnabled(0, 1)
      scrollActiveIntoView()
      break
    case 'End':
      e.preventDefault()
      activeIndex.value = firstEnabled(opts.value.length - 1, -1)
      scrollActiveIntoView()
      break
  }
}

watch(
  () => props.options,
  () => {
    if (open.value) reposition()
  },
)
onBeforeUnmount(() => closeMenu(false))
</script>

<template>
  <button
    :id="id"
    ref="triggerRef"
    type="button"
    role="combobox"
    :class="triggerCls"
    :disabled="disabled"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="listboxId"
    :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
    :aria-invalid="invalid"
    @click="toggle"
    @keydown="onKeydown"
  >
    <span class="min-w-0 flex-1 text-left">
      <!-- `value` slot lets a wrapper render a rich trigger label (default = plain text). -->
      <slot name="value" :selected="selected">
        <span :class="['block truncate', !selected && 'text-faint']">{{ selected?.label ?? placeholder ?? '' }}</span>
      </slot>
    </span>
    <ChevronDown :size="15" :class="['shrink-0 text-faint transition-transform duration-150', open && 'rotate-180']" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      :id="listboxId"
      ref="popupRef"
      role="listbox"
      class="anim-pop fixed z-[200] flex flex-col gap-px overflow-y-auto rounded-md border border-border-strong bg-elevated p-1 shadow-pop"
      :style="popupStyle"
    >
      <!-- Optional column header / heading row above the options (e.g. SequenceSelect). -->
      <slot name="listbox-header" />
      <button
        v-for="(o, i) in opts"
        :id="optionId(i)"
        :key="o.value"
        type="button"
        role="option"
        :data-idx="i"
        :aria-selected="o.value === model"
        :disabled="o.disabled"
        :class="optionCls(o, i)"
        :title="o.label"
        @mousedown.prevent
        @mouseenter="!o.disabled && (activeIndex = i)"
        @click="selectAt(i)"
      >
        <span class="min-w-0 flex-1 text-left">
          <!-- `option` slot lets a wrapper render rich rows (default = plain label). -->
          <slot name="option" :option="o" :index="i" :active="i === activeIndex" :selected="o.value === model">
            <span class="block truncate">{{ o.label }}</span>
          </slot>
        </span>
        <Check v-if="o.value === model" :size="14" class="shrink-0 text-accent" />
      </button>
      <p v-if="opts.length === 0" class="px-2 py-1.5 text-[12.5px] text-faint">No options</p>
    </div>
  </Teleport>
</template>
