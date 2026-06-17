/**
 * Unit tests for runtime helpers in instances.ts (isTerminal).
 */
import { describe, it, expect } from 'vitest'
import { isTerminal, TERMINAL_STATES } from './instances'
import type { InstanceState } from './instances'

describe('TERMINAL_STATES', () => {
  it('contains completed, failed, and cancelled', () => {
    expect(TERMINAL_STATES.has('completed')).toBe(true)
    expect(TERMINAL_STATES.has('failed')).toBe(true)
    expect(TERMINAL_STATES.has('cancelled')).toBe(true)
  })

  it('does not contain active states', () => {
    expect(TERMINAL_STATES.has('running')).toBe(false)
    expect(TERMINAL_STATES.has('waiting')).toBe(false)
    expect(TERMINAL_STATES.has('scheduled')).toBe(false)
    expect(TERMINAL_STATES.has('paused')).toBe(false)
  })
})

describe('isTerminal', () => {
  const terminalStates: InstanceState[] = ['completed', 'failed', 'cancelled']
  const activeStates: InstanceState[] = ['scheduled', 'running', 'waiting', 'paused']

  for (const state of terminalStates) {
    it(`returns true for "${state}"`, () => {
      expect(isTerminal(state)).toBe(true)
    })
  }

  for (const state of activeStates) {
    it(`returns false for "${state}"`, () => {
      expect(isTerminal(state)).toBe(false)
    })
  }
})
