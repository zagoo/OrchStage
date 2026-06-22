/**
 * RuntimeReferencePanel renders the complete runtime/template/expression/env
 * reference for the node editor's "Env Var" tab. These tests assert it shows
 * every section, surfaces concrete copyable examples for each requested context
 * kind, and gives EVERY entry exactly one copy affordance (the "easy-to-copy"
 * requirement) — so a rendering regression that hides the reference or drops the
 * copy buttons fails here.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RuntimeReferencePanel from './RuntimeReferencePanel.vue'
import { RUNTIME_REFERENCE } from './runtimeReference'

describe('RuntimeReferencePanel', () => {
  it('renders every section title', () => {
    const w = mount(RuntimeReferencePanel)
    for (const s of RUNTIME_REFERENCE) {
      expect(w.text(), `section "${s.title}"`).toContain(s.title)
    }
  })

  it('renders concrete, copy-ready examples for each context kind', () => {
    const t = mount(RuntimeReferencePanel).text()
    expect(t, 'data context').toContain('{{ context.data.user_id }}')
    expect(t, 'configuration context').toContain('{{ context.config.api_base_url }}')
    expect(t, 'node input context').toContain('{{ input.email }}')
    expect(t, 'node output context').toContain('{{ outputs.fetch_user.email }}')
    expect(t, 'runtime context').toContain('{{ runtime.attempt }}')
    expect(t, 'state context').toContain('{{ state.cursor }}')
    expect(t, 'expression').toContain("context.data.status == 'active'")
    expect(t, 'env var').toContain('OPENAI_API_KEY')
  })

  it('gives every entry exactly one copy button (the easy-to-copy requirement)', () => {
    const w = mount(RuntimeReferencePanel)
    const entryCount = RUNTIME_REFERENCE.flatMap((s) => s.entries).length
    const copyButtons = w.findAll('button[aria-label="Copy to clipboard"]')
    expect(copyButtons.length).toBe(entryCount)
  })

  it('copies the example string when a copy button is clicked', async () => {
    const writes: string[] = []
    Object.assign(navigator, { clipboard: { writeText: (v: string) => (writes.push(v), Promise.resolve()) } })
    const w = mount(RuntimeReferencePanel)
    await w.findAll('button[aria-label="Copy to clipboard"]')[0]!.trigger('click')
    expect(writes[0]).toContain('{{') // the first entry is a template variable example
  })

  it('renders the expression-function sub-group headings', () => {
    const t = mount(RuntimeReferencePanel).text()
    for (const g of ['Basic', 'Generators', 'Date / time', 'Strings & collections', 'Array operations', 'Numeric']) {
      expect(t, `group "${g}"`).toContain(g)
    }
  })

  it('makes the no-env-namespace honesty note visible', () => {
    const t = mount(RuntimeReferencePanel).text()
    expect(t).toContain('api_key_env')
    expect(t.toLowerCase()).toContain('no {{ env')
  })
})
