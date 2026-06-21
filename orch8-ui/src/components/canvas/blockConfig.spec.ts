/**
 * Guards the COMPLETE JSON examples surfaced by the node editor (Bug 1): each
 * advanced step JSON field must expose a full, nested example exactly as defined
 * here in source, and every handler param template must be valid JSON.
 */
import { describe, it, expect } from 'vitest'
import { STEP_JSON_FIELD_EXAMPLE, HANDLER_PARAM_TEMPLATE, STEP_HANDLERS } from './blockConfig'

describe('STEP_JSON_FIELD_EXAMPLE — complete advanced-field examples', () => {
  it('covers every advanced step JSON field', () => {
    expect(Object.keys(STEP_JSON_FIELD_EXAMPLE).sort()).toEqual(
      ['context_access', 'delay', 'on_deadline_breach', 'retry', 'send_window', 'wait_for_input'].sort(),
    )
  })

  it('retry / delay / send_window carry every interface field, incl. nested arrays', () => {
    expect(STEP_JSON_FIELD_EXAMPLE.retry).toEqual({
      max_attempts: 3,
      initial_backoff: 1,
      max_backoff: 60,
      backoff_multiplier: 2,
    })
    // DelaySpec: all optional fields present so the full shape is shown.
    expect(Object.keys(STEP_JSON_FIELD_EXAMPLE.delay as object).sort()).toEqual(
      ['business_days_only', 'duration', 'fire_at_local', 'holidays', 'jitter', 'timezone'].sort(),
    )
    expect((STEP_JSON_FIELD_EXAMPLE.send_window as { days: number[] }).days).toEqual([1, 2, 3, 4, 5])
  })

  it('wait_for_input shows the full parallel enumeration of choices', () => {
    const choices = (STEP_JSON_FIELD_EXAMPLE.wait_for_input as { choices: unknown[] }).choices
    expect(choices).toHaveLength(2)
  })

  it('every handler param template is a round-trippable JSON object', () => {
    for (const [h, tpl] of Object.entries(HANDLER_PARAM_TEMPLATE)) {
      expect(typeof tpl, h).toBe('object')
      expect(() => JSON.parse(JSON.stringify(tpl)), h).not.toThrow()
    }
  })

  it('offers a param template for every known handler', () => {
    for (const h of STEP_HANDLERS) {
      expect(HANDLER_PARAM_TEMPLATE[h], `template for ${h}`).toBeDefined()
    }
  })
})
