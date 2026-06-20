/**
 * Component test for NodeDetailPanel — verifies the editor emits the correct
 * structural/config mutations (which the view routes to the store, flipping
 * `dirty`). The form widgets (Input/Button/etc.) render for real so the
 * v-model → emit path is exercised.
 *
 * The `Tabs` stub renders NO slots — exactly like the real `Tabs.vue`, which is a
 * tab BAR only. The panel's content therefore must live OUTSIDE `<Tabs>` (as
 * v-show siblings) for these tests to find any inputs. A regression that puts the
 * editor back inside Tabs panel-slots (which never render) makes the whole config
 * panel blank — and now fails this suite instead of silently shipping read-only.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeDetailPanel from './NodeDetailPanel.vue'
import type { CanvasNodeData } from '@/api/types/canvas'
import type { StepBlock, RouterBlock } from '@/api/types/sequences'

const stepNode = (): CanvasNodeData => ({
  block: { type: 'step', id: 's1', handler: 'log', params: { a: 1 }, cancellable: false } as StepBlock,
  depth: 0,
  indexInDepth: 0,
})

const routerNode = (): CanvasNodeData => ({
  block: {
    type: 'router',
    id: 'r1',
    routes: [{ condition: 'a == 1', blocks: [] }],
    default: [{ type: 'step', id: 'd1', handler: 'log', params: {}, cancellable: false }],
  } as RouterBlock,
  depth: 0,
  indexInDepth: 0,
})

const stubs = {
  Drawer: { props: ['open', 'title', 'icon', 'width'], template: '<div class="drawer"><slot /></div>' },
  Tabs: { props: ['tabs', 'modelValue'], template: '<div class="tabs"></div>' },
}

function mountPanel(nodeData: CanvasNodeData = stepNode()) {
  return mount(NodeDetailPanel, { props: { open: true, nodeData }, global: { stubs } })
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

  // Router was previously non-editable (read-only) — its route conditions can
  // only be edited here, so this guards both the "blocks are read-only" fix and
  // the router edge-edit path that reuses this panel.
  it('emits update-config with edited router route conditions', async () => {
    const wrapper = mountPanel(routerNode())
    const cond = wrapper.find('input[placeholder="opened == true"]')
    expect(cond.exists()).toBe(true)
    await cond.setValue('opened == false')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')

    const events = wrapper.emitted('update-config')
    expect(events).toBeTruthy()
    const patch = events![0]![0] as Record<string, unknown>
    // Condition updated; the route's (empty) child blocks preserved; default omitted
    // from the patch so the shallow-merge keeps it.
    expect(patch.routes).toEqual([{ condition: 'opened == false', blocks: [] }])
    expect(patch.default).toBeUndefined()
  })

  it('adds and removes router routes before applying', async () => {
    const wrapper = mountPanel(routerNode())
    await buttonByText(wrapper, 'Add route')!.trigger('click')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    const patch = wrapper.emitted('update-config')![0]![0] as Record<string, unknown>
    expect((patch.routes as unknown[]).length).toBe(2)
  })
})
