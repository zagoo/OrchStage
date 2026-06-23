/**
 * CreateInstanceModal validation (Bugs 1 & 2):
 *  - Sequence is picked from a dropdown → its id populates sequence_id (required).
 *  - "Instance Key" (formerly Idempotency Key) is REQUIRED and is sent as the
 *    idempotency_key dedup field; a deduplicated response surfaces a notice.
 *
 * SequenceSelect / Modal / Select teleport or are heavy, so they're stubbed; the
 * validation + submit logic under test runs for real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CreateInstanceModal from './CreateInstanceModal.vue'
import { useUiStore } from '@/stores/ui'

vi.mock('@/api/instances', () => ({ createInstance: vi.fn(), createInstancesBatch: vi.fn() }))
vi.mock('@/api/sequences', () => ({ listSequencesArray: vi.fn().mockResolvedValue([]) }))

import { createInstance } from '@/api/instances'
const createMock = vi.mocked(createInstance)

const stubs = {
  Modal: {
    props: ['open', 'title', 'size'],
    template: '<div class="modal"><slot /><div class="ft"><slot name="footer" :close="() => {}" /></div></div>',
  },
  // Picking a sequence emits its id (mirrors the real SequenceSelect's contract).
  SequenceSelect: {
    props: ['modelValue', 'options', 'invalid', 'placeholder', 'id'],
    emits: ['update:modelValue'],
    template: '<button class="seqsel" type="button" @click="$emit(\'update:modelValue\', \'seq-123\')">pick</button>',
  },
  // priority Select → native stub
  Select: {
    props: ['modelValue', 'options', 'id'],
    emits: ['update:modelValue'],
    template:
      '<select class="prio" @change="$emit(\'update:modelValue\', $event.target.value)">' +
      '<option v-for="o in (options||[])" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
  },
}

function mountModal() {
  return mount(CreateInstanceModal, { props: { open: true }, global: { stubs } })
}
type Wrapper = ReturnType<typeof mountModal>

const clickCreate = (w: Wrapper) =>
  w.findAll('button').find((b) => b.text().includes('Create instance'))!.trigger('click')
const setInput = (w: Wrapper, placeholder: string, value: string) =>
  w.findAll('input').find((i) => i.attributes('placeholder') === placeholder)!.setValue(value)
const pickSequence = (w: Wrapper) => w.find('button.seqsel').trigger('click')

beforeEach(() => {
  setActivePinia(createPinia())
  createMock.mockReset()
  createMock.mockResolvedValue({ id: 'inst-1' })
})

describe('CreateInstanceModal', () => {
  it('requires an Instance Key — blocks create when empty', async () => {
    const w = mountModal()
    await pickSequence(w)
    await setInput(w, 'e.g. orders', 'orders')
    // Instance Key left blank
    await clickCreate(w)
    expect(createMock).not.toHaveBeenCalled()
    expect(w.text()).toContain('Instance Key is required.')
  })

  it('requires a Sequence — blocks create when none is picked', async () => {
    const w = mountModal()
    await setInput(w, 'e.g. orders', 'orders')
    await setInput(w, 'e.g. order-ORD-42-fulfill', 'key-1')
    await clickCreate(w)
    expect(createMock).not.toHaveBeenCalled()
    expect(w.text()).toContain('Sequence is required.')
  })

  it('submits the Instance Key as idempotency_key when all required fields are set', async () => {
    const w = mountModal()
    await pickSequence(w)
    await setInput(w, 'e.g. orders', 'orders')
    await setInput(w, 'e.g. order-ORD-42-fulfill', 'key-1')
    await clickCreate(w)
    await flushPromises()

    expect(createMock).toHaveBeenCalledTimes(1)
    const body = createMock.mock.calls[0]![0]
    expect(body.sequence_id).toBe('seq-123')
    expect(body.idempotency_key).toBe('key-1') // sent (no longer nulled when blank)
  })

  it('surfaces a dedup notice when the server returns deduplicated', async () => {
    createMock.mockResolvedValue({ id: 'inst-1', deduplicated: true })
    const ui = useUiStore()
    const w = mountModal()
    await pickSequence(w)
    await setInput(w, 'e.g. orders', 'orders')
    await setInput(w, 'e.g. order-ORD-42-fulfill', 'key-1')
    await clickCreate(w)
    await flushPromises()

    expect(ui.toasts.some((t) => t.title === 'Instance already exists')).toBe(true)
  })
})
