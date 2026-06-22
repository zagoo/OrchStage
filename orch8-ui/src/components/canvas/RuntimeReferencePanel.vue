<script setup lang="ts">
/**
 * "Env Var" tab content for the node editor — a complete, READ-ONLY reference of
 * everything a workflow author can reference while editing a node: template
 * variables (data / config / outputs / runtime / state contexts), interpolation
 * behaviour, pipe filters, template & expression functions, expression operators,
 * and the engine's environment variables.
 *
 * Every entry carries a concrete, copy-ready example (CopyButton). The data is the
 * single source of truth in runtimeReference.ts, extracted verbatim from the engine
 * source so it cannot drift. DESIGN_REFERENCE §dag-sequences.md (templates/expressions).
 */
import { Info } from 'lucide-vue-next'
import { RUNTIME_REFERENCE, type RefEntry } from './runtimeReference'
import CopyButton from '@/components/ui/CopyButton.vue'

/** True when this entry needs a group subheader (group changed from the previous one). */
function startsGroup(entries: RefEntry[], i: number): boolean {
  const g = entries[i].group
  return !!g && g !== entries[i - 1]?.group
}
</script>

<template>
  <div class="space-y-5">
    <!-- Intro: what this tab is + how to use it. -->
    <div class="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px] leading-snug text-muted">
      <Info :size="13" class="mt-0.5 shrink-0 text-subtle" />
      <span>
        Everything you can reference while editing a node — template variables, filters, functions, expression
        operators, and the engine environment. Interpolate with <code v-pre class="mono text-text">{{ … }}</code> in any
        string field. Click the copy icon on any example to copy it.
      </span>
    </div>

    <section v-for="section in RUNTIME_REFERENCE" :key="section.id" :aria-label="section.title">
      <!-- Section heading + count -->
      <div class="mb-1 flex items-baseline gap-2">
        <h3 class="text-[12px] font-semibold uppercase tracking-wider text-text">{{ section.title }}</h3>
        <span class="text-[10.5px] tabular-nums text-faint">{{ section.entries.length }}</span>
      </div>
      <p class="mb-2 text-[11px] leading-snug text-subtle">{{ section.blurb }}</p>

      <!-- Optional callout (precedence / env honesty note) -->
      <div
        v-if="section.note"
        class="mb-2 flex items-start gap-2 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11px] leading-snug text-muted"
      >
        <Info :size="12" class="mt-0.5 shrink-0 text-subtle" />
        <span>{{ section.note }}</span>
      </div>

      <ul class="space-y-1.5">
        <template v-for="(entry, i) in section.entries" :key="entry.syntax">
          <!-- Sub-group heading (expression functions / server env) -->
          <li
            v-if="startsGroup(section.entries, i)"
            class="px-0.5 pt-1 text-[10.5px] font-medium uppercase tracking-wider text-faint"
          >
            {{ entry.group }}
          </li>

          <li class="rounded-md border border-border bg-surface-2 px-2.5 py-2">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <code class="mono text-[12px] text-text">{{ entry.syntax }}</code>
              <span v-if="entry.meta" class="text-[10px] text-faint">{{ entry.meta }}</span>
              <!-- When the example IS the syntax (env var names, {{ instance_id }}), copy sits here. -->
              <CopyButton
                v-if="entry.example === entry.syntax"
                :value="entry.example"
                :size="12"
                class="ml-auto"
              />
            </div>
            <p class="mt-0.5 text-[11px] leading-snug text-subtle">{{ entry.desc }}</p>
            <!-- Concrete, copy-ready example (when it differs from the generic syntax). -->
            <div v-if="entry.example !== entry.syntax" class="mt-1 flex items-center gap-1.5">
              <code class="mono flex-1 break-all rounded bg-bg px-1.5 py-1 text-[11.5px] text-muted">{{ entry.example }}</code>
              <CopyButton :value="entry.example" :size="13" class="shrink-0" />
            </div>
          </li>
        </template>
      </ul>
    </section>
  </div>
</template>
