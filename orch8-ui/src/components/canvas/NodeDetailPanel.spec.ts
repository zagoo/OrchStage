/**
 * Component test for NodeDetailPanel — verifies the editor emits the correct
 * structural/config mutations (which the view routes to the store, flipping
 * `dirty`). Drawer/Tabs are stubbed to expose their slots; the form widgets
 * (Input/Button/etc.) render for real so the v-model → emit path is exercised.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeDetailPanel from './NodeDetailPanel.vue'
import type { CanvasNodeData } from '@/api/types/canvas'
import type { StepBlock } from '@/api/types/sequences'

const stepNode = (): CanvasNodeData => ({
  block: { type: 'step', id: 's1', handler: 'log', params: { a: 1 }, cancellable: false } as StepBlock,
  depth: 0,
  indexInDepth: 0,
})

const stubs = {
  Drawer: { props: ['open', 'title', 'icon', 'width'], template: '<div class="drawer"><slot /></div>' },
  Tabs: { props: ['tabs', 'modelValue'], template: '<div class="tabs"><slot name="config" /><slot name="live" /></div>' },
}

function mountPanel() {
  return mount(NodeDetailPanel, { props: { open: true, nodeData: stepNode() }, global: { stubs } })
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

describe('NodeDetailPanel', () => {
  it('emits update-config with the edited handler when Apply is clicked', async () => {
    const wrapper = mountPanel()
    const handlerInput = wrapper.find('input[placeholder^="log"]')
    expect(handlerInput.exists()).toBe(true)
    await handlerInput.setValue('http')

    await buttonByText(wrapper, 'Apply changes')!.trigger('click')

    const events = wrapper.emitted('update-config')
    expect(events).toBeTruthy()
    const patch = events![0]![0] as Record<string, unknown>
    expect(patch.handler).toBe('http')
    expect(patch.params).toEqual({ a: 1 }) // JSON round-trips
  })

  it('emits delete when Delete block is clicked', async () => {
    const wrapper = mountPanel()
    await buttonByText(wrapper, 'Delete block')!.trigger('click')
    expect(wrapper.emitted('delete')).toBeTruthy()
  })

  it('emits reorder up / down', async () => {
    const wrapper = mountPanel()
    await buttonByText(wrapper, 'Move up')!.trigger('click')
    await buttonByText(wrapper, 'Move down')!.trigger('click')
    const ev = wrapper.emitted('reorder')
    expect(ev).toBeTruthy()
    expect(ev![0]).toEqual(['up'])
    expect(ev![1]).toEqual(['down'])
  })

  it('emits insert-after', async () => {
    const wrapper = mountPanel()
    await buttonByText(wrapper, 'Insert step after')!.trigger('click')
    expect(wrapper.emitted('insert-after')).toBeTruthy()
  })

  it('blocks Apply and surfaces a JSON error for invalid params', async () => {
    const wrapper = mountPanel()
    const paramsArea = wrapper.find('textarea')
    await paramsArea.setValue('{ not valid json')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    expect(wrapper.emitted('update-config')).toBeFalsy()
    expect(wrapper.text()).toContain('Invalid JSON')
  })
})
