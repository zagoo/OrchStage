/**
 * JsonExampleControls must FULLY DISPLAY the JSON example (every nested level) as
 * readable text — not hide it behind a button or a truncated placeholder (Bug 1) —
 * and offer an Insert affordance.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JsonExampleControls from './JsonExampleControls.vue'

const value = '{\n  "max_attempts": 3,\n  "nested": {\n    "inner": [1, 2]\n  }\n}'

describe('JsonExampleControls', () => {
  it('renders the COMPLETE example as visible text, including nested levels', () => {
    const w = mount(JsonExampleControls, { props: { value } })
    const pre = w.find('pre')
    expect(pre.exists()).toBe(true) // displayed as a code block, not a placeholder
    expect(pre.text()).toContain('"max_attempts": 3')
    expect(pre.text()).toContain('"nested"')
    expect(pre.text()).toContain('"inner"') // a deeply nested key is shown in full
  })

  it('emits insert when Insert is clicked', async () => {
    const w = mount(JsonExampleControls, { props: { value } })
    const insert = w.findAll('button').find((b) => b.text().includes('Insert'))
    expect(insert).toBeTruthy()
    await insert!.trigger('click')
    expect(w.emitted('insert')).toBeTruthy()
  })

  it('lists the COMPLETE parameter reference when params are provided', () => {
    const w = mount(JsonExampleControls, {
      props: {
        value,
        params: [
          { name: 'url', required: true, meta: 'string · http(s) URL', desc: 'Endpoint URL.' },
          { name: 'method', required: false, meta: 'string · one of: GET, POST, PUT, PATCH, DELETE', desc: 'HTTP method.' },
        ],
      },
    })
    expect(w.text()).toContain('All parameters')
    expect(w.text()).toContain('url')
    expect(w.text()).toContain('required') // the required badge
    expect(w.text()).toContain('one of: GET, POST, PUT, PATCH, DELETE')
    expect(w.text()).toContain('Endpoint URL.')
  })

  it('omits the parameter reference when none are provided', () => {
    const w = mount(JsonExampleControls, { props: { value } })
    expect(w.text()).not.toContain('All parameters')
  })
})
