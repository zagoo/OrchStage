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
  HANDLER_PARAM_REQUIREMENTS,
  missingHandlerParams,
  HANDLER_PARAM_CONSTRAINTS,
  handlerParamConstraints,
  invalidHandlerParams,
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

describe('handler param templates mirror the engine contract (Bug 2 & 3)', () => {
  const T = HANDLER_PARAM_TEMPLATE as Record<string, Record<string, unknown>>

  it('send_signal uses signal_type (not signal) with a valid enum default', () => {
    expect(T.send_signal).toHaveProperty('signal_type')
    expect('signal' in T.send_signal).toBe(false)
    expect(['pause', 'resume', 'cancel', 'update_context']).toContain(T.send_signal.signal_type)
    expect(T.send_signal).toHaveProperty('instance_id')
  })

  it('corrected param names across the handler set (regression guard for the Bug-2 class)', () => {
    expect(T.emit_event).toHaveProperty('trigger_slug') // not `event`
    expect('event' in T.emit_event).toBe(false)
    expect(T.merge_state).toHaveProperty('values') // not `state`
    expect('state' in T.merge_state).toBe(false)
    expect(T.tool_call).toHaveProperty('url') // not `tool`
    expect(T.mcp_call).toHaveProperty('tool_name') // not `tool`
    expect(T.blob_get).toHaveProperty('ref') // not `key`
    expect(T.memory_search).toHaveProperty('top_k') // not `limit`
    expect(T.memory_store).toHaveProperty('text') // not `value`/`namespace`
    expect(T.llm_call).toHaveProperty('messages') // input is messages, not `prompt`
    expect('prompt' in T.llm_call).toBe(false)
    expect('query' in T.http_request).toBe(false) // handler reads no `query`
    expect(T.fail).toHaveProperty('retryable') // not `code`
  })

  it('every handler with a required-param contract ships a template declaring those keys', () => {
    for (const [h, req] of Object.entries(HANDLER_PARAM_REQUIREMENTS)) {
      const tpl = HANDLER_PARAM_TEMPLATE[h] as Record<string, unknown> | undefined
      expect(tpl, `template for ${h}`).toBeDefined()
      for (const k of req.required ?? []) expect(k in (tpl as object), `${h}.${k}`).toBe(true)
      for (const k of req.requiredAny ?? []) expect(k in (tpl as object), `${h}.${k}`).toBe(true)
      for (const group of req.oneOf ?? [])
        expect(group.some((k) => k in (tpl as object)), `${h} oneOf ${group.join('|')}`).toBe(true)
    }
  })
})

describe('missingHandlerParams — required-param validation (Bug 3)', () => {
  it('flags a send_signal step missing signal_type, passes when present', () => {
    expect(missingHandlerParams('send_signal', { instance_id: 'i1' })).toEqual(['signal_type'])
    expect(missingHandlerParams('send_signal', { instance_id: 'i1', signal_type: 'cancel' })).toEqual([])
    expect(missingHandlerParams('send_signal', {})).toEqual(['instance_id', 'signal_type'])
  })

  it('treats blank / whitespace strings as missing', () => {
    expect(missingHandlerParams('emit_event', { trigger_slug: '   ' })).toEqual(['trigger_slug'])
    expect(missingHandlerParams('assert', { condition: '' })).toEqual(['condition'])
    expect(missingHandlerParams('http_request', { url: 'https://x' })).toEqual([])
  })

  it('handlers with no contract never report missing', () => {
    for (const h of ['log', 'llm_call', 'agent', 'transform', 'noop', 'human_review', 'fail', 'sleep', 'email_send'])
      expect(missingHandlerParams(h, {}), h).toEqual([])
  })

  it('oneOf: any one alternative satisfies the requirement', () => {
    expect(missingHandlerParams('memory_store', {})).toEqual(['text or embedding'])
    expect(missingHandlerParams('memory_store', { text: 'hi' })).toEqual([])
    expect(missingHandlerParams('memory_store', { embedding: [0.1] })).toEqual([])
    expect(missingHandlerParams('blob_put', {})).toEqual(['text or data'])
    expect(missingHandlerParams('memory_search', { query_embedding: [0.1] })).toEqual([])
  })

  it('requiredAny: key must be PRESENT but may be empty/null', () => {
    expect(missingHandlerParams('set_state', { key: 'k' })).toEqual(['value']) // value key absent
    expect(missingHandlerParams('set_state', { key: 'k', value: '' })).toEqual([]) // empty string OK
    expect(missingHandlerParams('set_state', { key: 'k', value: null })).toEqual([]) // null OK
    expect(missingHandlerParams('set_state', { value: 1 })).toEqual(['key']) // key still required non-blank
    expect(missingHandlerParams('merge_state', {})).toEqual(['values'])
    expect(missingHandlerParams('merge_state', { values: {} })).toEqual([]) // empty object OK
  })

  it('mcp_call: needs url-or-server, and tool_name only for action=call', () => {
    expect(missingHandlerParams('mcp_call', { action: 'call' }).sort()).toEqual(['tool_name', 'url or server'])
    expect(missingHandlerParams('mcp_call', { url: 'https://m', tool_name: 't' })).toEqual([])
    expect(missingHandlerParams('mcp_call', { server: 'srv', tool_name: 't' })).toEqual([])
    expect(missingHandlerParams('mcp_call', { url: 'https://m', action: 'list' })).toEqual([]) // list needs no tool_name
  })

  it('non-object params are treated as empty (all required reported)', () => {
    expect(missingHandlerParams('http_request', null)).toEqual(['url'])
    expect(missingHandlerParams('http_request', 'oops')).toEqual(['url'])
    expect(missingHandlerParams('query_instance', undefined)).toEqual(['instance_id'])
  })
})

describe('handler param VALUE constraints — display surface (round 12)', () => {
  it('every constrained param carries a non-trivial allowed-values label', () => {
    for (const [h, cons] of Object.entries(HANDLER_PARAM_CONSTRAINTS)) {
      expect(cons.length, h).toBeGreaterThan(0)
      for (const c of cons) {
        expect(c.param, `${h} param`).toBeTruthy()
        expect(c.label.length, `${h}.${c.param} label`).toBeGreaterThan(3)
      }
    }
  })

  it('enum labels enumerate EVERY allowed value the source defines', () => {
    const labelFor = (h: string, p: string) => handlerParamConstraints(h).find((c) => c.param === p)!.label
    expect(labelFor('send_signal', 'signal_type')).toContain('pause, resume, cancel, update_context')
    expect(labelFor('http_request', 'method')).toContain('GET, POST, PUT, PATCH, DELETE')
    expect(labelFor('tool_call', 'method')).toContain('GET, POST, PUT, PATCH')
    expect(labelFor('mcp_call', 'action')).toContain('call, list')
    expect(labelFor('agent', 'max_iterations')).toContain('1–50')
    expect(labelFor('blob_get', 'encoding')).toContain('base64, utf8')
    expect(labelFor('emit_event', 'dedupe_scope')).toContain('parent, tenant')
  })

  it('handlerParamConstraints returns [] for an unconstrained / unknown handler', () => {
    expect(handlerParamConstraints('noop')).toEqual([])
    expect(handlerParamConstraints('totally_custom')).toEqual([])
  })
})

describe('invalidHandlerParams — value validation (round 12)', () => {
  it('rejects a bad enum value, accepts a valid one (and the custom object form)', () => {
    expect(invalidHandlerParams('send_signal', { signal_type: 'bogus' })[0]).toMatch(/signal_type must be one of/)
    expect(invalidHandlerParams('send_signal', { signal_type: 'cancel' })).toEqual([])
    expect(invalidHandlerParams('send_signal', { signal_type: { custom: 'x' } })).toEqual([])
    expect(invalidHandlerParams('log', { level: 'warning' })[0]).toMatch(/level must be one of: debug, info, warn/)
    expect(invalidHandlerParams('mcp_call', { action: 'invoke' })[0]).toMatch(/action must be one of: call, list/)
  })

  it('http_request method allows DELETE; tool_call method does NOT', () => {
    expect(invalidHandlerParams('http_request', { url: 'https://x', method: 'DELETE' })).toEqual([])
    expect(invalidHandlerParams('tool_call', { url: 'https://x', method: 'DELETE' })[0]).toMatch(/method must be one of: GET, POST, PUT, PATCH/)
  })

  it('rejects out-of-range / non-integer numbers', () => {
    expect(invalidHandlerParams('agent', { max_iterations: 0 })[0]).toMatch(/max_iterations must be an integer 1–50/)
    expect(invalidHandlerParams('agent', { max_iterations: 51 })[0]).toMatch(/1–50/)
    expect(invalidHandlerParams('agent', { max_iterations: 6 })).toEqual([])
    expect(invalidHandlerParams('memory_search', { top_k: 0 })[0]).toMatch(/top_k must be an integer ≥ 1/)
    expect(invalidHandlerParams('sleep', { duration_ms: -5 })[0]).toMatch(/duration_ms must be an integer ≥ 0/)
    expect(invalidHandlerParams('sleep', { duration_ms: 2.5 })[0]).toMatch(/integer/)
  })

  it('validates URL format and a nested path (agent.tool_dispatch.type)', () => {
    expect(invalidHandlerParams('http_request', { url: 'ftp://x' })[0]).toMatch(/url must be an http\(s\) URL/)
    expect(invalidHandlerParams('http_request', { url: 'https://api.example.com' })).toEqual([])
    expect(invalidHandlerParams('agent', { tool_dispatch: { type: 'grpc' } })[0]).toMatch(/tool_dispatch\.type must be one of: http, mcp/)
    expect(invalidHandlerParams('agent', { tool_dispatch: { type: 'mcp' } })).toEqual([])
  })

  it('skips runtime {{ … }} template refs', () => {
    expect(invalidHandlerParams('send_signal', { signal_type: '{{ state.sig }}' })).toEqual([])
    expect(invalidHandlerParams('http_request', { url: '{{ config.endpoint }}' })).toEqual([])
    expect(invalidHandlerParams('agent', { max_iterations: '{{ config.n }}' })).toEqual([])
  })

  it('ignores absent/blank values and display-only constraints (provider falls back → open set)', () => {
    expect(invalidHandlerParams('send_signal', { instance_id: 'i' })).toEqual([])
    expect(invalidHandlerParams('http_request', { url: 'https://x', method: '' })).toEqual([])
    expect(invalidHandlerParams('llm_call', { provider: 'my-proxy', model: 'm' })).toEqual([])
  })
})
