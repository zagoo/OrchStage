import { describe, it, expect } from 'vitest'
import { parseInjectedSignals } from './signals'

describe('parseInjectedSignals', () => {
  it('treats empty / whitespace input as no signals (no error)', () => {
    expect(parseInjectedSignals('')).toEqual({})
    expect(parseInjectedSignals('   \n ')).toEqual({})
  })

  it('parses a valid array of signals (with payload)', () => {
    const r = parseInjectedSignals('[{ "signal_type": "resume", "payload": { "ok": true } }]')
    expect(r.error).toBeUndefined()
    expect(r.signals).toEqual([{ signal_type: 'resume', payload: { ok: true } }])
  })

  it('allows a signal without a payload', () => {
    expect(parseInjectedSignals('[{ "signal_type": "cancel" }]').signals).toEqual([
      { signal_type: 'cancel' },
    ])
  })

  it('accepts the custom-signal object form { custom: "name" }', () => {
    const r = parseInjectedSignals('[{ "signal_type": { "custom": "approval" }, "payload": { "ok": true } }]')
    expect(r.error).toBeUndefined()
    expect(r.signals).toEqual([{ signal_type: { custom: 'approval' }, payload: { ok: true } }])
  })

  it('rejects an unknown builtin signal_type string (engine enum is closed)', () => {
    // "approval" is not pause/resume/cancel/update_context — must use the custom object form.
    expect(parseInjectedSignals('[{ "signal_type": "approval" }]').error).toMatch(/signal_type/i)
  })

  it('rejects a custom object without a non-empty string name', () => {
    expect(parseInjectedSignals('[{ "signal_type": {} }]').error).toBeTruthy()
    expect(parseInjectedSignals('[{ "signal_type": { "custom": "" } }]').error).toBeTruthy()
  })

  it('rejects invalid JSON', () => {
    const r = parseInjectedSignals('[{ not json')
    expect(r.signals).toBeUndefined()
    expect(r.error).toMatch(/json/i)
  })

  it('rejects a non-array JSON value', () => {
    expect(parseInjectedSignals('{ "signal_type": "resume" }').error).toMatch(/array/i)
  })

  it('rejects an item missing a non-empty string signal_type', () => {
    expect(parseInjectedSignals('[{ "payload": {} }]').error).toMatch(/signal_type/i)
    expect(parseInjectedSignals('[{ "signal_type": "" }]').error).toMatch(/signal_type/i)
    expect(parseInjectedSignals('[{ "signal_type": 5 }]').error).toMatch(/signal_type/i)
  })

  it('rejects when any item is not an object', () => {
    expect(parseInjectedSignals('["resume"]').error).toBeTruthy()
    expect(parseInjectedSignals('[null]').error).toBeTruthy()
  })
})
