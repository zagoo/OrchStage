/**
 * The "Env Var" tab is only trustworthy if its data matches the engine EXACTLY.
 * These tests pin the reference to the engine source it was extracted from, so a
 * future drift (a renamed filter, a dropped expression function, an invented
 * `${…}` / `{{ env }}` syntax the engine does not have) fails the build instead of
 * silently shipping wrong documentation.
 *
 * Source of truth (verified at authoring time):
 *   - roots           orch8-engine/src/template.rs:538-626
 *   - pipe filters    orch8-engine/src/template.rs:232-397   (7 no-arg + 7 arg = 14)
 *   - template fns    orch8-engine/src/template.rs:656-675   (json, len)
 *   - expression fns  orch8-engine/src/expression.rs:654-875 (25, exact match arms)
 *   - provider keys   orch8-engine/src/handlers/llm/common.rs:226-238
 *   - server env vars literal env::var() names across the engine repo
 */
import { describe, it, expect } from 'vitest'
import { RUNTIME_REFERENCE, RUNTIME_REFERENCE_SECTION_IDS, type RefEntry } from './runtimeReference'

const allEntries: RefEntry[] = RUNTIME_REFERENCE.flatMap((s) => s.entries)
const section = (id: string) => RUNTIME_REFERENCE.find((s) => s.id === id)!
const syntaxes = (id: string) => section(id).entries.map((e) => e.syntax)

describe('runtimeReference — structural integrity', () => {
  it('every section has id / title / blurb and at least one entry', () => {
    for (const s of RUNTIME_REFERENCE) {
      expect(s.id, 'section id').toBeTruthy()
      expect(s.title, `${s.id} title`).toBeTruthy()
      expect(s.blurb, `${s.id} blurb`).toBeTruthy()
      expect(s.entries.length, `${s.id} entries`).toBeGreaterThan(0)
    }
  })

  it('every entry has a non-empty syntax, description and copy-ready example', () => {
    for (const e of allEntries) {
      expect(e.syntax.trim(), 'syntax').not.toBe('')
      expect(e.desc.trim(), `desc for "${e.syntax}"`).not.toBe('')
      expect(e.example.trim(), `example for "${e.syntax}"`).not.toBe('')
    }
  })

  it('section ids are unique and match the exported id list', () => {
    const ids = RUNTIME_REFERENCE.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(RUNTIME_REFERENCE_SECTION_IDS).toEqual(ids)
  })

  it('every {{ … }} example is brace-balanced (no malformed snippet ships)', () => {
    for (const e of allEntries) {
      const opens = (e.example.match(/\{\{/g) ?? []).length
      const closes = (e.example.match(/\}\}/g) ?? []).length
      expect(opens, `balanced braces in "${e.example}"`).toBe(closes)
    }
  })

  it('covers the four requested context kinds (data / config / node input / node output)', () => {
    const blob = JSON.stringify(section('variables').entries)
    expect(blob, 'data context').toContain('context.data')
    expect(blob, 'configuration context').toContain('context.config')
    expect(blob, 'node input context').toContain('input.')
    expect(blob, 'node output context').toContain('outputs.')
  })
})

describe('runtimeReference — matches the engine source exactly (anti-drift)', () => {
  it('lists every template variable ROOT the engine resolves (template.rs:538-546)', () => {
    const text = JSON.stringify(syntaxes('variables'))
    for (const root of [
      'context.data',
      'data.',
      'context.config',
      'config.',
      'input.',
      'outputs.',
      'steps.',
      'instance_id',
      'state.',
      'runtime.attempt',
      'runtime.total_steps_executed',
      'runtime.current_step',
      'runtime.started_at',
      'runtime.current_step_started_at',
      'runtime.instance_id',
      'runtime.dry_run',
      'runtime.dry_run_auto_approve',
      'runtime.resource_key',
    ]) {
      expect(text, `variables should document ${root}`).toContain(root)
    }
  })

  it('lists exactly the 14 template pipe filters', () => {
    const names = syntaxes('filters')
    expect(names.length).toBe(14)
    for (const f of [
      '| upper',
      '| lower',
      '| trim',
      '| abs',
      '| url_encode',
      '| base64',
      '| base64_decode',
      "| replace('old', 'new')",
      "| default('fallback')",
      "| truncate(20, '…')",
      "| join(', ')",
      "| split(',')",
      "| hash('sha256')",
      '| round(2)',
    ]) {
      expect(names, `filters should include ${f}`).toContain(f)
    }
  })

  it('lists both template functions, json and len', () => {
    expect(syntaxes('template-functions')).toEqual(['json(value)', 'len(value)'])
  })

  it('lists EXACTLY the 25 expression functions from apply_function', () => {
    const fnNames = section('expr-functions')
      .entries.map((e) => e.syntax.replace(/\(.*/, ''))
      .sort()
    expect(fnNames).toEqual(
      [
        'abs', 'len', 'json', 'now', 'uuid', 'random', 'format_date', 'day_of_week',
        'keys', 'values', 'contains', 'count', 'starts_with', 'ends_with',
        'first', 'last', 'slice', 'sort', 'unique',
        'sum', 'avg', 'min', 'max', 'change_pct', 'clamp',
      ].sort(),
    )
    expect(fnNames.length).toBe(25)
  })

  it('documents the expression operators (comparison / logical / arithmetic / in / ternary)', () => {
    const text = JSON.stringify(syntaxes('expr-operators'))
    for (const op of ['==', '!=', '>=', '&&', '||', ' in ', '?']) {
      expect(text, `operators should document ${op}`).toContain(op)
    }
  })

  it('every expression function carries a sub-group heading', () => {
    for (const e of section('expr-functions').entries) {
      expect(e.group, `group for ${e.syntax}`).toBeTruthy()
    }
  })
})

describe('runtimeReference — EXCLUDES environment variables (Context tab scope)', () => {
  // The tab was narrowed from "Env Var" to "Context": only what a node can actually
  // READ at runtime. Env var names/values (provider keys, ORCH8_* server config) and
  // the api_key_env param are not readable inside a node, so they must NOT appear.
  it('contains exactly the six context/template/expression sections (no env sections)', () => {
    expect(RUNTIME_REFERENCE.map((s) => s.id)).toEqual([
      'variables',
      'interpolation',
      'filters',
      'template-functions',
      'expr-operators',
      'expr-functions',
    ])
  })

  it('lists no environment variable or api_key_env param in any entry', () => {
    for (const e of allEntries) {
      const blob = `${e.syntax} ${e.example} ${e.meta ?? ''}`
      expect(blob, `entry "${e.syntax}" must not mention env vars`).not.toMatch(
        /ORCH8_|_API_KEY\b|api_key_env|OTEL_SERVICE_NAME|\bHOSTNAME\b|\bPOD_NAME\b/,
      )
    }
  })

  it('never mentions provider keys or env config anywhere in the data', () => {
    const blob = JSON.stringify(RUNTIME_REFERENCE)
    for (const banned of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ORCH8_', 'api_key_env', 'Environment']) {
      expect(blob, `data must not contain "${banned}"`).not.toContain(banned)
    }
  })
})

describe('runtimeReference — does not invent syntax the engine lacks', () => {
  it('never uses a ${…} interpolation (engine only has {{ … }})', () => {
    expect(JSON.stringify(RUNTIME_REFERENCE)).not.toContain('${')
  })

  it('never references a {{ env.X }} namespace in any entry (no such root exists)', () => {
    for (const e of allEntries) {
      expect(e.syntax, `syntax "${e.syntax}"`).not.toMatch(/\{\{\s*env\./)
      expect(e.example, `example "${e.example}"`).not.toMatch(/\{\{\s*env\./)
    }
  })
})
