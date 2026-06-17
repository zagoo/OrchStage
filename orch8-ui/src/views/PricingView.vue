<script setup lang="ts">
/**
 * Pricing — Model pricing reference table (read-only).
 *
 * NOTE: There is NO HTTP endpoint for the pricing table. The table is a
 * process-scoped static structure in the Rust server (model_pricing.rs).
 * This view renders the hard-coded client-side copy from
 * @/api/types/observability MODEL_PRICING_TABLE, which mirrors the server
 * defaults. Runtime overrides set via the ORCH8_MODEL_PRICING env var are
 * NOT reflected here. This view is intentionally read-only — there is no
 * write endpoint to modify pricing at runtime.
 * DESIGN_REFERENCE §Model Pricing (observability.md §Model Pricing Reference)
 */
import { ref, computed } from 'vue'
import { Coins } from 'lucide-vue-next'
import { MODEL_PRICING_TABLE } from '@/api/types/observability'
import type { ModelPrice } from '@/api/types/observability'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'

// --- search filter ---
const search = ref('')

const filteredRows = computed<ModelPrice[]>(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return MODEL_PRICING_TABLE
  return MODEL_PRICING_TABLE.filter((r) => r.prefix.includes(q))
})

// --- provider grouping helper ---
const PROVIDER_PREFIXES: Array<{ label: string; match: (prefix: string) => boolean }> = [
  { label: 'OpenAI', match: (p) => p.startsWith('gpt') || p.startsWith('o1') || p.startsWith('o3') || p.startsWith('o4') },
  { label: 'Anthropic', match: (p) => p.startsWith('claude') },
  { label: 'Google', match: (p) => p.startsWith('gemini') },
  { label: 'DeepSeek', match: (p) => p.startsWith('deepseek') },
  { label: 'Mistral', match: (p) => p.startsWith('mistral') },
  { label: 'Meta', match: (p) => p.startsWith('llama') },
  { label: 'xAI', match: (p) => p.startsWith('grok') },
  { label: 'Alibaba', match: (p) => p.startsWith('qwen') },
  { label: 'Cohere', match: (p) => p.startsWith('command') },
  { label: 'Amazon', match: (p) => p.startsWith('nova') },
]

function providerFor(prefix: string): string {
  return PROVIDER_PREFIXES.find((p) => p.match(prefix))?.label ?? 'Other'
}

const providerTones: Record<string, 'accent' | 'info' | 'success' | 'purple' | 'teal' | 'cyan' | 'warning' | 'neutral'> = {
  OpenAI: 'success',
  Anthropic: 'accent',
  Google: 'info',
  DeepSeek: 'teal',
  Mistral: 'purple',
  Meta: 'warning',
  xAI: 'cyan',
  Alibaba: 'neutral',
  Cohere: 'info',
  Amazon: 'warning',
}

// --- table ---
const columns: Column[] = [
  { key: 'provider', header: 'Provider', width: '120px' },
  { key: 'prefix', header: 'Model prefix', mono: true },
  { key: 'input_per_1m', header: 'Input $/1M', width: '130px', align: 'right' },
  { key: 'output_per_1m', header: 'Output $/1M', width: '140px', align: 'right' },
]

function rowKey(r: ModelPrice): string { return r.prefix }

function formatPrice(v: number): string {
  return `$${v.toFixed(v < 1 ? 3 : 2)}`
}
</script>

<template>
  <div>
    <PageHeader
      title="Model Pricing"
      description="List-price reference table used by the server for cost estimation in GET /usage. Read-only — there is no HTTP endpoint to modify pricing at runtime."
      :icon="Coins"
    />

    <!-- read-only notice -->
    <div class="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[12.5px] text-warning">
      This table is hard-coded in the server process (<code class="mono">model_pricing.rs</code>).
      Runtime overrides can only be applied via the <code class="mono">ORCH8_MODEL_PRICING</code> environment variable on server startup — there is no write endpoint.
      Prices are mid-2025 list prices.
    </div>

    <Panel title="Pricing table" :subtitle="`${filteredRows.length} of ${MODEL_PRICING_TABLE.length} entries`">
      <template #actions>
        <Input
          v-model="search"
          placeholder="Filter by model prefix…"
          class="w-56"
          aria-label="Filter model pricing"
        />
      </template>

      <DataTable
        :columns="columns"
        :rows="filteredRows"
        :row-key="rowKey"
        empty-title="No matching models"
        empty-description="Try a shorter search term."
      >
        <template #cell-provider="{ row }">
          <Badge :tone="providerTones[providerFor(row.prefix)] ?? 'neutral'">
            {{ providerFor(row.prefix) }}
          </Badge>
        </template>

        <template #cell-prefix="{ row }">
          <span class="mono text-[12px]">{{ row.prefix }}</span>
        </template>

        <template #cell-input_per_1m="{ row }">
          <span class="mono text-text">{{ formatPrice(row.input_per_1m) }}</span>
        </template>

        <template #cell-output_per_1m="{ row }">
          <span class="mono text-text">{{ formatPrice(row.output_per_1m) }}</span>
        </template>
      </DataTable>
    </Panel>

    <!-- lookup legend -->
    <Panel title="Lookup rules" class="mt-5" subtitle="How the server resolves a model name to a price row">
      <ol class="list-decimal pl-5 space-y-1.5 text-[13px] text-muted">
        <li>Normalize: trim, lowercase, strip provider prefix (<code class="mono">anthropic/claude-sonnet-4</code> becomes <code class="mono">claude-sonnet-4</code>).</li>
        <li>Match keys where the normalized name starts with the key AND the following character is absent or non-alphanumeric (prevents <code class="mono">gpt-4o-mini</code> from matching <code class="mono">gpt-4o</code>).</li>
        <li>The <strong>longest</strong> matching prefix wins.</li>
        <li>No match → <code class="mono">cost_usd: null</code> for that usage aggregate row.</li>
      </ol>
      <p class="mt-3 text-[12px] text-subtle">
        Cost formula: <code class="mono">(input_tokens / 1M) × input_per_1m + (output_tokens / 1M) × output_per_1m</code>, rounded to 6 decimal places.
      </p>
    </Panel>
  </div>
</template>
