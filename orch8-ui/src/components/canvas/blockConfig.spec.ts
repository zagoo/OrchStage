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
  HANDLER_PARAM_SPEC,
  missingHandlerParams,
  handlerParamReference,
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

  it('emit_event template includes dedupe_key AND dedupe_scope (round-13 regression)', () => {
    // The exact omission the user reported as "disastrous" — guard it forever.
    expect(T.emit_event).toHaveProperty('dedupe_key')
    expect(T.emit_event).toHaveProperty('dedupe_scope')
    expect(T.emit_event).toHaveProperty('meta')
    expect(T.emit_event).toHaveProperty('data')
    expect(['parent', 'tenant']).toContain(T.emit_event.dedupe_scope)
  })
})

describe('HANDLER_PARAM_SPEC is the single source of truth (round 13)', () => {
  it('every STEP_HANDLER has a spec entry and a derived template', () => {
    for (const h of STEP_HANDLERS) {
      expect(HANDLER_PARAM_SPEC[h], `spec for ${h}`).toBeDefined()
      expect(HANDLER_PARAM_TEMPLATE[h], `template for ${h}`).toBeDefined()
    }
  })

  it('the template is DERIVED from the spec — every template key is a top-level spec param with an example', () => {
    for (const h of STEP_HANDLERS) {
      const defs = HANDLER_PARAM_SPEC[h]
      const tpl = HANDLER_PARAM_TEMPLATE[h] as Record<string, unknown>
      for (const key of Object.keys(tpl)) {
        const def = defs.find((d) => d.name === key)
        expect(def, `${h}.${key} present in spec`).toBeDefined()
        expect(def!.example, `${h}.${key} has an example`).not.toBeUndefined()
      }
    }
  })

  it('every REQUIRED param appears in the starter template so the operator sees it', () => {
    for (const h of STEP_HANDLERS) {
      const tpl = HANDLER_PARAM_TEMPLATE[h] as Record<string, unknown>
      for (const d of HANDLER_PARAM_SPEC[h]) {
        if ((d.required || d.requiredPresent) && !d.name.includes('.') && !d.name.includes('[')) {
          expect(d.name in tpl, `${h}.${d.name} required → in template`).toBe(true)
        }
      }
    }
  })

  it('spec params are well-formed (unique names, non-empty descriptions)', () => {
    for (const [h, defs] of Object.entries(HANDLER_PARAM_SPEC)) {
      const names = defs.map((d) => d.name)
      expect(new Set(names).size, `${h} unique param names`).toBe(names.length)
      for (const d of defs) expect(d.desc.length, `${h}.${d.name} desc`).toBeGreaterThan(5)
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

describe('handlerParamReference — COMPLETE parameter reference (round 13)', () => {
  it('lists EVERY param the spec defines (not just the templated ones)', () => {
    const ref = handlerParamReference('llm_call')
    expect(ref.length).toBe(HANDLER_PARAM_SPEC.llm_call.length)
    const names = ref.map((r) => r.name)
    expect(names).toContain('response_schema') // advanced, absent from the starter template
    expect(names).toContain('providers')
    expect(names).toContain('messages')
  })

  it('marks required params and enumerates EVERY allowed value / range in meta', () => {
    const rowFor = (h: string, p: string) => handlerParamReference(h).find((r) => r.name === p)!
    expect(rowFor('send_signal', 'signal_type').required).toBe(true)
    expect(rowFor('send_signal', 'signal_type').meta).toContain('pause, resume, cancel, update_context')
    expect(rowFor('http_request', 'method').meta).toContain('GET, POST, PUT, PATCH, DELETE')
    expect(rowFor('tool_call', 'method').meta).toContain('GET, POST, PUT, PATCH')
    expect(rowFor('mcp_call', 'action').meta).toContain('call, list')
    expect(rowFor('agent', 'max_iterations').meta).toContain('1–50')
    expect(rowFor('blob_get', 'encoding').meta).toContain('base64, utf8')
    expect(rowFor('emit_event', 'dedupe_scope').meta).toContain('parent, tenant')
    expect(rowFor('emit_event', 'trigger_slug').required).toBe(true)
  })

  it('returns [] for an unconstrained / unknown handler', () => {
    expect(handlerParamReference('noop')).toEqual([])
    expect(handlerParamReference('totally_custom')).toEqual([])
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
