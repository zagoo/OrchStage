import { describe, it, expect } from 'vitest'
import { ApiError, isApiError, errorMessage, parseErrorBody } from './errors'

describe('parseErrorBody', () => {
  it('parses the nested { error: { code, message } } envelope', () => {
    const e = parseErrorBody(404, JSON.stringify({ error: { code: 'not_found', message: 'No such instance' } }), 'req-1')
    expect(e.status).toBe(404)
    expect(e.code).toBe('not_found')
    expect(e.message).toBe('No such instance')
    expect(e.requestId).toBe('req-1')
  })
  it('parses a flat { code, message } envelope', () => {
    const e = parseErrorBody(422, JSON.stringify({ code: 'validation_error', message: 'bad', details: { field: 'name' } }))
    expect(e.code).toBe('validation_error')
    expect(e.details).toEqual({ field: 'name' })
  })
  it('falls back to plain text', () => {
    const e = parseErrorBody(500, 'internal boom')
    expect(e.code).toBe('http_500')
    expect(e.message).toBe('internal boom')
  })
  it('falls back when body is empty', () => {
    const e = parseErrorBody(503, '')
    expect(e.message).toMatch(/status 503/)
  })
})

describe('ApiError classification', () => {
  it('classifies status families', () => {
    expect(new ApiError(401, { code: 'x', message: '' }).isAuth).toBe(true)
    expect(new ApiError(403, { code: 'x', message: '' }).isAuth).toBe(true)
    expect(new ApiError(404, { code: 'x', message: '' }).isNotFound).toBe(true)
    expect(new ApiError(409, { code: 'x', message: '' }).isConflict).toBe(true)
    expect(new ApiError(422, { code: 'x', message: '' }).isValidation).toBe(true)
    expect(new ApiError(429, { code: 'x', message: '' }).isRateLimited).toBe(true)
  })
  it('marks 5xx/network/429 retryable, 4xx not', () => {
    expect(new ApiError(500, { code: 'x', message: '' }).isRetryable).toBe(true)
    expect(ApiError.network('down').isRetryable).toBe(true)
    expect(new ApiError(400, { code: 'x', message: '' }).isRetryable).toBe(false)
  })
})

describe('helpers', () => {
  it('isApiError narrows', () => {
    expect(isApiError(new ApiError(400, { code: 'x', message: 'y' }))).toBe(true)
    expect(isApiError(new Error('plain'))).toBe(false)
  })
  it('errorMessage extracts from any throwable', () => {
    expect(errorMessage(new ApiError(400, { code: 'x', message: 'envelope' }))).toBe('envelope')
    expect(errorMessage(new Error('native'))).toBe('native')
    expect(errorMessage('string error')).toBe('string error')
    expect(errorMessage(null)).toMatch(/unexpected/)
  })
})
