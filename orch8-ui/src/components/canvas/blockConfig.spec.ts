/**
 * Guards the COMPLETE JSON examples surfaced by the node editor (Bug 1): each
 * advanced step JSON field must expose a full, nested example exactly as defined
 * here in source, and every handler param template must be valid JSON.
 */
import { describe, it, expect } from 'vitest'
import type { BlockType } from '@/api/types/sequences'
import {
  STEP_JSON_FIELD_EXAMPLE,
  HANDLER_PARAM_TEMPLATE,
  STEP_HANDLERS,
  BLOCK_VISUAL,
  BLOCK_TYPE_DESCRIPTION,
  blockTypeDescription,
  HANDLER_DESCRIPTION,
  handlerDescription,
} from './blockConfig'

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

describe('business-logic descriptions (block type + handler)', () => {
  it('has a meaningful description for EVERY block type', () => {
    for (const t of Object.keys(BLOCK_VISUAL) as BlockType[]) {
      expect(BLOCK_TYPE_DESCRIPTION[t], t).toBeTruthy()
      expect(blockTypeDescription(t).length, t).toBeGreaterThan(15)
    }
  })

  it('has a description for every known handler', () => {
    for (const h of STEP_HANDLERS) {
      expect(HANDLER_DESCRIPTION[h], h).toBeTruthy()
      expect(handlerDescription(h)!.length, h).toBeGreaterThan(10)
    }
  })

  it('handlerDescription returns undefined for an unknown/custom handler', () => {
    expect(handlerDescription('totally_custom_handler')).toBeUndefined()
  })
})
