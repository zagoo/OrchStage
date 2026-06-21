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
import type {
  StepBlock,
  RouterBlock,
  LoopBlock,
  ABSplitBlock,
  ParallelBlock,
  TryCatchBlock,
} from '@/api/types/sequences'

const stepNode = (): CanvasNodeData => ({
  block: { type: 'step', id: 's1', handler: 'log', params: { a: 1 }, cancellable: false } as StepBlock,
  depth: 0,
  indexInDepth: 0,
})

const stepNodeEmptyParams = (): CanvasNodeData => ({
  block: { type: 'step', id: 's2', handler: 'log', params: {}, cancellable: false } as StepBlock,
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

const loopNode = (): CanvasNodeData => ({
  block: {
    type: 'loop',
    id: 'l1',
    condition: 'x < 3',
    body: [{ type: 'step', id: 'b1', handler: 'log', params: {}, cancellable: false }],
    max_iterations: 5,
    continue_on_error: false,
  } as LoopBlock,
  depth: 0,
  indexInDepth: 0,
})

const abSplitNode = (): CanvasNodeData => ({
  block: {
    type: 'a_b_split',
    id: 'ab1',
    variants: [
      { name: 'A', weight: 60, blocks: [] },
      { name: 'B', weight: 40, blocks: [] },
    ],
  } as ABSplitBlock,
  depth: 0,
  indexInDepth: 0,
})

const parallelNode = (): CanvasNodeData => ({
  block: { type: 'parallel', id: 'p1', branches: [[]] } as ParallelBlock,
  depth: 0,
  indexInDepth: 0,
})

const routerNoDefault = (): CanvasNodeData => ({
  block: { type: 'router', id: 'rND', routes: [{ condition: 'c', blocks: [] }] } as RouterBlock,
  depth: 0,
  indexInDepth: 0,
})

const tryCatchNode = (hasFinally = false): CanvasNodeData => ({
  block: {
    type: 'try_catch',
    id: 'tc1',
    try_block: [{ type: 'step', id: 't', handler: 'log', params: {}, cancellable: false }],
    catch_block: [],
    ...(hasFinally ? { finally_block: [] } : {}),
  } as TryCatchBlock,
  depth: 0,
  indexInDepth: 0,
})

const stubs = {
  Drawer: { props: ['open', 'title', 'icon', 'width'], template: '<div class="drawer"><slot /></div>' },
  Tabs: { props: ['tabs', 'modelValue'], template: '<div class="tabs"></div>' },
  // Select is the custom listbox (teleported popup, click-to-open) — its behaviour is
  // covered by Select.spec.ts. Here we stub it with a native <select> mirroring the same
  // API so these tests stay focused on NodeDetailPanel's emit logic, not Select internals.
  Select: {
    props: ['modelValue', 'options', 'placeholder', 'disabled', 'id', 'invalid'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)">' +
      '<option v-for="o in (options||[])" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
  },
}

function mountPanel(nodeData: CanvasNodeData = stepNode()) {
  return mount(NodeDetailPanel, { props: { open: true, nodeData }, global: { stubs } })
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

/** Find the <select> that offers a given option value (block-type vs handler picker). */
function selectWith(wrapper: ReturnType<typeof mountPanel>, optionValue: string) {
  return wrapper
    .findAll('select')
    .find((s) => s.findAll('option').some((o) => (o.element as HTMLOptionElement).value === optionValue))
}

describe('NodeDetailPanel', () => {
  it('applies edited params without altering the unchanged handler', async () => {
    const wrapper = mountPanel()
    await wrapper.find('textarea').setValue('{"a":2}')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')

    const patch = wrapper.emitted('update-config')![0]![0] as Record<string, unknown>
    expect(patch.handler).toBe('log') // handler Select model-value, unchanged
    expect(patch.params).toEqual({ a: 2 })
  })

  it('selecting a handler fills EMPTY Params with its template and applies it', async () => {
    const wrapper = mountPanel(stepNodeEmptyParams())
    const handlerSelect = selectWith(wrapper, 'http_request')
    expect(handlerSelect?.exists()).toBe(true)
    await handlerSelect!.setValue('http_request')

    // Params was empty/pristine → template fills in directly
    expect(wrapper.find('textarea').element.value).toContain('"method"')

    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    const patch = wrapper.emitted('update-config')!.at(-1)![0] as Record<string, unknown>
    expect(patch.handler).toBe('http_request')
    expect((patch.params as Record<string, unknown>).method).toBe('GET')
  })

  it('does NOT overwrite custom Params on handler change; offers an opt-in template', async () => {
    const wrapper = mountPanel() // params { a: 1 } — custom content
    const before = wrapper.find('textarea').element.value
    await selectWith(wrapper, 'http_request')!.setValue('http_request')

    // custom Params preserved, NOT clobbered
    expect(wrapper.find('textarea').element.value).toBe(before)
    // an explicit opt-in is offered
    const useBtn = wrapper.findAll('button').find((b) => /Use the http_request template/.test(b.text()))
    expect(useBtn).toBeTruthy()

    // accepting the offer fills the template
    await useBtn!.trigger('click')
    expect(wrapper.find('textarea').element.value).toContain('"method"')
  })

  it('selecting send_signal fills signal_type (not signal) and warns about the blank instance_id', async () => {
    const wrapper = mountPanel(stepNodeEmptyParams())
    await selectWith(wrapper, 'send_signal')!.setValue('send_signal')

    const text = wrapper.find('textarea').element.value
    expect(text).toContain('"signal_type"')
    expect(text).not.toContain('"signal"') // the old, server-rejected key is gone
    // signal_type defaults to a valid enum; only instance_id is blank → live hint lists it
    expect(wrapper.text()).toContain('Missing required param')
    expect(wrapper.text()).toContain('instance_id')
  })

  it('blocks Apply when a required handler param is missing, then emits once provided (Bug 3)', async () => {
    const wrapper = mountPanel(stepNodeEmptyParams())
    await selectWith(wrapper, 'send_signal')!.setValue('send_signal')

    // template instance_id is blank → Apply must NOT commit
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    expect(wrapper.emitted('update-config')).toBeFalsy()

    // fill the required param → Apply now commits with the corrected param name
    await wrapper.find('textarea').setValue('{"instance_id":"i1","signal_type":"cancel","payload":{}}')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    const patch = wrapper.emitted('update-config')!.at(-1)![0] as Record<string, unknown>
    expect((patch.params as Record<string, unknown>).signal_type).toBe('cancel')
    expect(patch.handler).toBe('send_signal')
  })

  it('emits change-type when a different block type is selected', async () => {
    const wrapper = mountPanel()
    const typeSelect = selectWith(wrapper, 'loop')
    expect(typeSelect?.exists()).toBe(true)
    await typeSelect!.setValue('loop')

    const ev = wrapper.emitted('change-type')
    expect(ev).toBeTruthy()
    expect(ev![0]).toEqual(['loop'])
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

  // --- Complete field rendering for every block type (Bug 1) ---

  it('renders the COMPLETE StepBlock field set', () => {
    const t = mountPanel().text()
    for (const label of [
      'Handler',
      'Timeout',
      'Queue',
      'Rate-limit key',
      'Cancellable',
      'Params',
      'Deadline',
      'Fallback handler',
      'Cache key',
      'Retry policy',
      'Delay',
      'Send window',
      'Context access',
      'Wait for input',
      'On deadline breach',
    ]) {
      expect(t, `step panel should render "${label}"`).toContain(label)
    }
  })

  it('parses and applies an advanced step JSON field (retry policy)', async () => {
    const wrapper = mountPanel(stepNodeEmptyParams())
    const retry = wrapper.findAll('textarea').find((a) => (a.attributes('placeholder') ?? '').includes('max_attempts'))
    expect(retry).toBeTruthy()
    await retry!.setValue('{"max_attempts":5,"initial_backoff":2,"max_backoff":30,"backoff_multiplier":2}')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    const patch = wrapper.emitted('update-config')!.at(-1)![0] as Record<string, unknown>
    expect((patch.retry as Record<string, unknown>).max_attempts).toBe(5)
  })

  it('applies the loop continue_on_error flag + required max_iterations', async () => {
    const wrapper = mountPanel(loopNode())
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    const patch = wrapper.emitted('update-config')![0]![0] as Record<string, unknown>
    expect(patch.continue_on_error).toBe(true)
    expect(patch.max_iterations).toBe(5)
  })

  it('renders + applies a_b_split variant name/weight (number coercion)', async () => {
    const wrapper = mountPanel(abSplitNode())
    expect(wrapper.text()).toContain('Variant 1')
    expect(wrapper.text()).toContain('Variant 2')
    await buttonByText(wrapper, 'Apply changes')!.trigger('click')
    const patch = wrapper.emitted('update-config')![0]![0] as Record<string, unknown>
    expect(patch.variants).toEqual([
      { name: 'A', weight: 60, blocks: [] },
      { name: 'B', weight: 40, blocks: [] },
    ])
  })

  // --- Editable Block ID (Bug 3) ---

  it('Block ID is editable — Enter emits change-id with the trimmed value', async () => {
    const wrapper = mountPanel()
    const idInput = wrapper.find('input[placeholder="unique_block_id"]')
    expect(idInput.exists()).toBe(true)
    await idInput.setValue('  s1_renamed  ')
    await idInput.trigger('keyup', { key: 'Enter' })
    const ev = wrapper.emitted('change-id')
    expect(ev).toBeTruthy()
    expect(ev![0]).toEqual(['s1_renamed'])
  })

  it('Block ID commit is suppressed when the id is unchanged', async () => {
    const wrapper = mountPanel()
    const idInput = wrapper.find('input[placeholder="unique_block_id"]')
    await idInput.setValue('s1') // same as the block id
    await idInput.trigger('keyup', { key: 'Enter' })
    expect(wrapper.emitted('change-id')).toBeFalsy()
  })

  // --- Complete JSON example controls (Bug 1) ---

  it('"Insert" drops the complete handler template into the Params field', async () => {
    const wrapper = mountPanel(stepNodeEmptyParams())
    const insert = wrapper.findAll('button').find((b) => b.text().trim() === 'Insert')
    expect(insert, 'an Insert example button should render on JSON fields').toBeTruthy()
    await insert!.trigger('click')
    const params = wrapper.find('textarea').element.value
    expect(params).toContain('"message"')
    expect(params).toContain('"level"')
  })

  // --- Add optional container slots: branch / default / finally (Bugs 2-5) ---

  it('Parallel exposes "Add branch" and emits add-container "branch"', async () => {
    const wrapper = mountPanel(parallelNode())
    const btn = buttonByText(wrapper, 'Add branch')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('add-container')![0]).toEqual(['branch'])
  })

  it('Router without a default exposes "Add default branch" and emits "default"', async () => {
    const wrapper = mountPanel(routerNoDefault())
    const btn = buttonByText(wrapper, 'Add default branch')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('add-container')![0]).toEqual(['default'])
  })

  it('Router that already has a default does NOT offer "Add default branch"', () => {
    const wrapper = mountPanel(routerNode()) // routerNode() includes a default branch
    expect(buttonByText(wrapper, 'Add default branch')).toBeFalsy()
  })

  it('TryCatch exposes "Add finally block" → "finally" (and hides it once present)', async () => {
    const wrapper = mountPanel(tryCatchNode())
    const btn = buttonByText(wrapper, 'Add finally block')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('add-container')![0]).toEqual(['finally'])
    expect(buttonByText(mountPanel(tryCatchNode(true)), 'Add finally block')).toBeFalsy()
  })

  // --- Business-logic descriptions for block type + handler (Bugs 6-7) ---

  it('shows a business-logic description for the selected block type and handler', () => {
    const t = mountPanel().text() // step node, handler 'log'
    expect(t, 'block-type description').toContain('single unit of work')
    expect(t, 'handler description').toContain('observability')
  })
})
