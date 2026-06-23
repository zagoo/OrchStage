/**
 * SequenceSelect renders the catalog as a 3-column dropdown (Name · Version · Status)
 * and yields the chosen sequence's id. The real Select teleports its listbox, so we
 * stub `teleport` to render it inline and assert the rows + emit.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SequenceSelect from './SequenceSelect.vue'
import type { SequenceDefinition, SequenceStatus } from '@/api/types/sequences'

function seq(id: string, name: string, version: number, status: SequenceStatus = 'production'): SequenceDefinition {
  return {
    id,
    name,
    version,
    status,
    tenant_id: 't',
    namespace: 'default',
    deprecated: false,
    blocks: [],
    created_at: '2024-01-01T00:00:00Z',
  } as SequenceDefinition
}

const options = [seq('id-1', 'welcome-campaign', 1), seq('id-2', 'order-flow', 3, 'staging')]

function mountSel(props: Record<string, unknown> = {}) {
  return mount(SequenceSelect, { props: { options, ...props }, global: { stubs: { teleport: true } } })
}

describe('SequenceSelect', () => {
  it('shows the selected sequence as "<name> v<version>" in the trigger', () => {
    const trigger = mountSel({ modelValue: 'id-2' }).get('button[role="combobox"]')
    expect(trigger.text()).toContain('order-flow')
    expect(trigger.text()).toContain('v3')
  })

  it('renders one 3-column row per sequence and emits the id on select', async () => {
    const w = mountSel()
    await w.get('button[role="combobox"]').trigger('click')
    const opts = w.findAll('[role="option"]')
    expect(opts.length).toBe(2)

    const t = w.text()
    expect(t).toContain('welcome-campaign')
    expect(t).toContain('v1')
    expect(t).toContain('production')
    expect(t).toContain('order-flow')
    expect(t).toContain('staging')

    // Sorted by name → order-flow (id-2) first; selecting emits its id.
    await opts[0]!.trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual(['id-2'])
  })

  it('labels the three columns (Sequence name / Version / Status)', async () => {
    const w = mountSel()
    await w.get('button[role="combobox"]').trigger('click')
    const t = w.text()
    expect(t).toContain('Sequence name')
    expect(t).toContain('Version')
    expect(t).toContain('Status')
  })

  it('clearable prepends an "All sequences" row that clears a selection to empty', async () => {
    // Start with a real selection so picking "All" is an actual change (→ emits '').
    const w = mountSel({ clearable: true, modelValue: 'id-2' })
    await w.get('button[role="combobox"]').trigger('click')
    const opts = w.findAll('[role="option"]')
    expect(opts.length).toBe(3) // All + 2 sequences
    expect(opts[0]!.text()).toContain('All sequences')
    await opts[0]!.trigger('click')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([''])
  })
})
