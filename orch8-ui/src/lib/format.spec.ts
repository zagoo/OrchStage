import { describe, it, expect } from 'vitest'
import {
  formatRelative,
  formatDateTime,
  formatDuration,
  parseIso8601Duration,
  formatBytes,
  formatNumber,
  formatPercent,
  shortId,
  titleCase,
  prettyJson,
} from './format'

describe('formatRelative', () => {
  const now = Date.parse('2026-06-17T12:00:00Z')
  it('renders past times', () => {
    expect(formatRelative('2026-06-17T11:57:00Z', now)).toBe('3 minutes ago')
    expect(formatRelative('2026-06-15T12:00:00Z', now)).toBe('2 days ago')
  })
  it('renders future times', () => {
    expect(formatRelative('2026-06-17T14:00:00Z', now)).toBe('in 2 hours')
  })
  it('handles null/invalid as em-dash', () => {
    expect(formatRelative(null, now)).toBe('—')
    expect(formatRelative('not-a-date', now)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('formats sub-second, seconds, minutes, hours, days', () => {
    expect(formatDuration(920)).toBe('920ms')
    expect(formatDuration(3400)).toBe('3.4s')
    expect(formatDuration(72_000)).toBe('1m 12s')
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(90_000_000)).toBe('1d 1h')
  })
  it('guards null/NaN', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('parseIso8601Duration', () => {
  it('parses PT forms to ms', () => {
    expect(parseIso8601Duration('PT1S')).toBe(1000)
    expect(parseIso8601Duration('PT30M')).toBe(1_800_000)
    expect(parseIso8601Duration('PT2H')).toBe(7_200_000)
    expect(parseIso8601Duration('P1DT1H')).toBe(90_000_000)
  })
  it('returns null on garbage/empty', () => {
    expect(parseIso8601Duration('nope')).toBeNull()
    expect(parseIso8601Duration('')).toBeNull()
    expect(parseIso8601Duration(null)).toBeNull()
  })
})

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(65_536)).toBe('64 KB')
    expect(formatBytes(5_242_880)).toBe('5.0 MB')
  })
  it('guards null', () => {
    expect(formatBytes(null)).toBe('—')
  })
})

describe('misc formatters', () => {
  it('formatNumber groups thousands', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(null)).toBe('—')
  })
  it('formatPercent', () => {
    expect(formatPercent(0.1234)).toBe('12.3%')
    expect(formatPercent(null)).toBe('—')
  })
  it('shortId truncates long ids only', () => {
    expect(shortId('01950000-0000-7000-8000-000000000001')).toBe('01950000…0001')
    expect(shortId('short')).toBe('short')
    expect(shortId(null)).toBe('—')
  })
  it('titleCase normalises separators', () => {
    expect(titleCase('half_open')).toBe('Half Open')
    expect(titleCase('queue-routing')).toBe('Queue Routing')
  })
  it('prettyJson pretty-prints and tolerates cycles', () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(typeof prettyJson(cyclic)).toBe('string')
  })
  it('formatDateTime guards invalid', () => {
    expect(formatDateTime('bad')).toBe('—')
    expect(formatDateTime(null)).toBe('—')
  })
})
