import { describe, it, expect } from 'vitest'
import {
  isUuid,
  isSlug,
  isCronExpression,
  isValidJson,
  required,
  minLength,
  maxLength,
  uuid,
  slug,
  identifier,
  integer,
  range,
  min,
  jsonRule,
  cron,
  validateField,
  validateForm,
} from './validation'

describe('predicates', () => {
  it('isUuid', () => {
    expect(isUuid('01950000-0000-7000-8000-000000000001')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid(42)).toBe(false)
  })
  it('isSlug enforces ^[a-z0-9][a-z0-9-]*$', () => {
    expect(isSlug('order-created')).toBe(true)
    expect(isSlug('-leading')).toBe(false)
    expect(isSlug('Upper')).toBe(false)
  })
  it('isCronExpression accepts 5–6 fields, rejects others', () => {
    expect(isCronExpression('*/5 * * * *')).toBe(true)
    expect(isCronExpression('0 0 1 * * *')).toBe(true)
    expect(isCronExpression('* * *')).toBe(false)
    expect(isCronExpression('bogus@@')).toBe(false)
  })
  it('isValidJson', () => {
    expect(isValidJson('{"a":1}')).toBe(true)
    expect(isValidJson('{bad}')).toBe(false)
    expect(isValidJson('')).toBe(false)
  })
})

describe('rule factories', () => {
  it('required flags empty values', () => {
    expect(required('Name')('')).toBe('Name is required.')
    expect(required('Name')('  ')).toBe('Name is required.')
    expect(required('Name')('ok')).toBeNull()
  })
  it('length rules', () => {
    expect(minLength(3)('ab')).toMatch(/at least 3/)
    expect(minLength(3)('abc')).toBeNull()
    expect(maxLength(2)('abc')).toMatch(/at most 2/)
  })
  it('uuid/slug/identifier skip empty but validate present values', () => {
    expect(uuid()('')).toBeNull()
    expect(uuid()('bad')).toMatch(/valid UUID/)
    expect(slug()('Bad Slug')).toMatch(/lowercase/)
    expect(identifier()('1ok.name-_x')).toBeNull()
    expect(identifier()('.bad')).toMatch(/must start/)
  })
  it('integer/range/min', () => {
    expect(integer()('3.5')).toMatch(/whole number/)
    expect(integer()('3')).toBeNull()
    expect(range(1, 10)('11')).toMatch(/between 1 and 10/)
    expect(range(1, 10)('5')).toBeNull()
    expect(min(0)('-1')).toMatch(/at least 0/)
  })
  it('jsonRule and cron', () => {
    expect(jsonRule()('{bad}')).toMatch(/valid JSON/)
    expect(jsonRule()('{"x":1}')).toBeNull()
    expect(cron()('* * *')).toMatch(/cron/)
    expect(cron()('* * * * *')).toBeNull()
  })
})

describe('validateField / validateForm', () => {
  it('returns first failing rule', () => {
    expect(validateField('', [required('X'), minLength(3)])).toBe('X is required.')
    expect(validateField('ab', [required('X'), minLength(3)])).toMatch(/at least 3/)
    expect(validateField('abc', [required('X'), minLength(3)])).toBeNull()
  })
  it('aggregates a form and reports validity', () => {
    const res = validateForm(
      { name: '', sequence_id: 'bad' },
      { name: [required('Name')], sequence_id: [uuid('Sequence ID')] },
    )
    expect(res.valid).toBe(false)
    expect(res.errors.name).toBe('Name is required.')
    expect(res.errors.sequence_id).toMatch(/valid UUID/)
  })
  it('passes a valid form', () => {
    const res = validateForm(
      { name: 'job', slug: 'order-created' },
      { name: [required('Name')], slug: [slug()] },
    )
    expect(res.valid).toBe(true)
  })
})
