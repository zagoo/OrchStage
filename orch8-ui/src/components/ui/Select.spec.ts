/**
 * Select is a CUSTOM listbox (no native <select>) per CLAUDE.md Rule 7 / DESIGN.md.
 * These tests pin the behaviour that makes it a drop-in for a native select:
 * trigger shows the value, click/keyboard open the listbox, options select + emit,
 * disabled options are inert, and ARIA/expanded state is correct.
 *
 * `teleport: true` renders the teleported popup inline so it is queryable.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Select from './Select.vue'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(Select, { props: { options, ...props }, global: { stubs: { teleport: true } } })
}

describe('Select (custom listbox)', () => {
  it('renders a combobox trigger, NOT a native <select>', () => {
    const w = mountSelect()
    expect(w.find('select').exists()).toBe(false)
    const trigger = w.find('button[role="combobox"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('shows the selected label, or the placeholder when empty', () => {
    expect(mountSelect({ modelValue: 'b' }).find('button[role="combobox"]').text()).toContain('Beta')
    expect(mountSelect({ placeholder: 'Pick one' }).find('button[role="combobox"]').text()).toContain('Pick one')
  })

  it('opens on click and renders the options in a listbox', async () => {
    const w = mountSelect()
    expect(w.find('[role="listbox"]').exists()).toBe(false)
    await w.find('button[role="combobox"]').trigger('click')
    expect(w.find('[role="listbox"]').exists()).toBe(true)
    expect(w.findAll('[role="option"]')).toHaveLength(3)
    expect(w.find('button[role="combobox"]').attributes('aria-expanded')).toBe('true')
  })

  it('selecting an option emits update:modelValue and closes', async () => {
    const w = mountSelect()
    await w.find('button[role="combobox"]').trigger('click')
    const beta = w.findAll('[role="option"]').find((o) => o.text().includes('Beta'))!
    await beta.trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual(['b'])
    expect(w.find('[role="listbox"]').exists()).toBe(false)
  })

  it('marks the selected option aria-selected', async () => {
    const w = mountSelect({ modelValue: 'a' })
    await w.find('button[role="combobox"]').trigger('click')
    const sel = w.findAll('[role="option"]').find((o) => o.attributes('aria-selected') === 'true')!
    expect(sel.text()).toContain('Alpha')
  })

  it('does NOT select a disabled option', async () => {
    const w = mountSelect()
    await w.find('button[role="combobox"]').trigger('click')
    const gamma = w.findAll('[role="option"]').find((o) => o.text().includes('Gamma'))!
    await gamma.trigger('click')
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('keyboard: ArrowDown opens, skips the disabled row, Enter selects', async () => {
    const w = mountSelect({ modelValue: 'a' })
    const trigger = w.find('button[role="combobox"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // opens, active = selected 'a'
    expect(w.find('[role="listbox"]').exists()).toBe(true)
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // active → 'b'
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
  })

  it('Escape closes the popup', async () => {
    const w = mountSelect()
    const trigger = w.find('button[role="combobox"]')
    await trigger.trigger('click')
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(w.find('[role="listbox"]').exists()).toBe(false)
  })

  it('a disabled select does not open', async () => {
    const w = mountSelect({ disabled: true })
    await w.find('button[role="combobox"]').trigger('click')
    expect(w.find('[role="listbox"]').exists()).toBe(false)
  })
})
