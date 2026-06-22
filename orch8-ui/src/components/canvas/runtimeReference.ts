/**
 * Complete CONTEXT REFERENCE for the node editor's "Context" tab.
 *
 * Single source of truth for everything a node can actually READ at runtime and the
 * template / expression methods used to read it — extracted VERBATIM from the engine
 * source so it cannot drift:
 *
 *   - template variable namespaces  → engine orch8-engine/src/template.rs:538-626
 *   - interpolation behaviour        → engine orch8-engine/src/template.rs:80-218
 *   - template pipe filters (14)     → engine orch8-engine/src/template.rs:232-397
 *   - template functions (2)         → engine orch8-engine/src/template.rs:656-675
 *   - expression operators           → engine orch8-engine/src/expression.rs:134-582
 *   - expression functions (25)      → engine orch8-engine/src/expression.rs:654-875
 *
 * SCOPE — ONLY what a node can access/read. Environment variables are deliberately
 * EXCLUDED: the engine exposes NO `{{ env.X }}` namespace and has NO per-step `env`
 * field (template.rs:538-546 enumerates every root; StepDef has none), and process /
 * server env var VALUES (provider API keys, ORCH8_* server config) are never readable
 * inside a node — so they are not shown here. The one env-adjacent knob, the
 * `api_key_env` PARAM on llm/embedding handlers, is documented in that handler's
 * parameter reference (the Config tab), not in this read-only context reference. The
 * only interpolation delimiter is `{{ … }}` (no `${…}`, no `{%…%}`).
 */

export interface RefEntry {
  /** Heading / canonical syntax, e.g. "{{ context.data.<field> }}", "| upper", "sum(arr)". */
  syntax: string
  /** What it does, in one line. */
  desc: string
  /** A concrete, copy-ready example — exactly what the Copy button copies. */
  example: string
  /** Optional small type/return/scope tag, e.g. "any", "→ boolean". */
  meta?: string
  /** Optional sub-group heading (used to cluster the 25 expression functions). */
  group?: string
}

export interface RefSection {
  /** Stable id (Vue keys + tests). */
  id: string
  /** Section heading shown in the tab. */
  title: string
  /** One/two-line explanation under the heading. */
  blurb: string
  /** Optional callout (e.g. the operator-precedence note). */
  note?: string
  entries: RefEntry[]
}

// --- 1. Template variables (the readable context namespaces) -----------------
// template.rs:538-546 enumerates EVERY valid root: context | outputs | steps |
// input | instance_id | config | data | runtime | state.
const VARIABLES: RefEntry[] = [
  {
    syntax: '{{ context.data.<field> }}',
    desc: "The run's read/write data bag: the initial input plus anything earlier steps wrote (set_context, a decision's store_as, the for_each item var).",
    example: '{{ context.data.user_id }}',
    meta: 'any · shorthand: data.<field>',
  },
  {
    syntax: '{{ data.<field> }}',
    desc: 'Shorthand for context.data — the same read/write data bag.',
    example: '{{ data.order.total }}',
    meta: 'any',
  },
  {
    syntax: '{{ context.config.<field> }}',
    desc: 'Read-only configuration supplied when the instance was created. Cannot be mutated by a handler.',
    example: '{{ context.config.api_base_url }}',
    meta: 'any · shorthand: config.<field>',
  },
  {
    syntax: '{{ config.<field> }}',
    desc: 'Shorthand for context.config — the read-only configuration object.',
    example: '{{ config.region }}',
    meta: 'any',
  },
  {
    syntax: '{{ input.<field> }}',
    desc: 'The initial run input — shorthand for context.data.input.',
    example: '{{ input.email }}',
    meta: 'any',
  },
  {
    syntax: '{{ outputs.<step_id>.<field> }}',
    desc: 'Output of an earlier step, keyed by its block id. Navigate nested values with dots; index arrays by position.',
    example: '{{ outputs.fetch_user.email }}',
    meta: 'any · alias: steps.<step_id>',
  },
  {
    syntax: '{{ steps.<step_id>.<field> }}',
    desc: 'Identical alias of outputs — read an earlier step’s result by its block id.',
    example: '{{ steps.fetch_user.profile.name }}',
    meta: 'any',
  },
  {
    syntax: '{{ instance_id }}',
    desc: 'The running instance’s UUID.',
    example: '{{ instance_id }}',
    meta: 'string',
  },
  {
    syntax: '{{ state.<key> }}',
    desc: 'Durable per-instance key/value store written by set_state, merge_state and memory_store. Fetched lazily, only when referenced.',
    example: '{{ state.cursor }}',
    meta: 'any',
  },
  {
    syntax: '{{ runtime.attempt }}',
    desc: 'Retry attempt for the current step (0 = first try).',
    example: '{{ runtime.attempt }}',
    meta: 'integer',
  },
  {
    syntax: '{{ runtime.total_steps_executed }}',
    desc: 'Cumulative step executions for this run, including retries.',
    example: '{{ runtime.total_steps_executed }}',
    meta: 'integer',
  },
  {
    syntax: '{{ runtime.current_step }}',
    desc: 'Block id of the step currently executing.',
    example: '{{ runtime.current_step }}',
    meta: 'string',
  },
  {
    syntax: '{{ runtime.started_at }}',
    desc: 'RFC3339 timestamp of when the instance started.',
    example: '{{ runtime.started_at }}',
    meta: 'datetime',
  },
  {
    syntax: '{{ runtime.current_step_started_at }}',
    desc: 'RFC3339 timestamp of when the current step started — the baseline for per-step deadlines / wait_for_input timeouts.',
    example: '{{ runtime.current_step_started_at }}',
    meta: 'datetime',
  },
  {
    syntax: '{{ runtime.instance_id }}',
    desc: 'Instance UUID (same value as {{ instance_id }}).',
    example: '{{ runtime.instance_id }}',
    meta: 'string',
  },
  {
    syntax: '{{ runtime.dry_run }}',
    desc: 'True when the run is a dry-run simulation (side-effecting handlers return stub output).',
    example: '{{ runtime.dry_run }}',
    meta: 'boolean',
  },
  {
    syntax: '{{ runtime.dry_run_auto_approve }}',
    desc: 'In a dry-run, whether human_review / wait_for_input gates auto-approve instead of pausing.',
    example: '{{ runtime.dry_run_auto_approve }}',
    meta: 'boolean',
  },
  {
    syntax: '{{ runtime.resource_key }}',
    desc: 'Internal concurrency / rate-limit key for the current step. Often null.',
    example: '{{ runtime.resource_key }}',
    meta: 'string?',
  },
]

// --- 2. Interpolation behaviour ---------------------------------------------
// template.rs:80-218 — whole-value vs embedded, fallback chain, missing→null.
const INTERPOLATION: RefEntry[] = [
  {
    syntax: '{{ value }}  (whole value)',
    desc: 'A field that is exactly one expression keeps the value’s real JSON type — object, array, number or boolean, not a string.',
    example: '{{ outputs.fetch_user.profile }}',
    meta: 'keeps type',
  },
  {
    syntax: '"… {{ value }} …"  (embedded)',
    desc: 'Embedded in surrounding text the value is stringified; objects and arrays become JSON.',
    example: 'Hello {{ context.data.name }}!',
    meta: '→ string',
  },
  {
    syntax: "{{ a | b | 'fallback' }}",
    desc: 'Non-filter pipe segments form a fallback chain: the first non-null / non-empty wins; a quoted literal is the final default.',
    example: "{{ outputs.a.val | context.data.def | 'N/A' }}",
    meta: 'fallback chain',
  },
  {
    syntax: 'missing → null',
    desc: 'An unknown path resolves to null (no error is raised). Substitute with the default filter.',
    example: "{{ context.data.maybe | default('none') }}",
    meta: 'no throw',
  },
  {
    syntax: '{{ list.<index> }}',
    desc: 'Index into an array by zero-based position using a dot.',
    example: '{{ context.data.items.0 }}',
    meta: 'array index',
  },
  {
    syntax: '{{  (no escaping)',
    desc: 'There is no escape for {{. To emit a literal brace pair, pass it as data and interpolate that value.',
    example: '{{ context.data.literal_braces }}',
    meta: 'no escape',
  },
]

// --- 3. Template pipe filters (14) ------------------------------------------
// template.rs:232-397 — 7 no-arg + 7 arg-taking.
const FILTERS: RefEntry[] = [
  { syntax: '| upper', desc: 'Uppercase a string.', example: '{{ context.data.code | upper }}' },
  { syntax: '| lower', desc: 'Lowercase a string.', example: '{{ context.data.code | lower }}' },
  { syntax: '| trim', desc: 'Strip leading and trailing whitespace.', example: '{{ context.data.name | trim }}' },
  { syntax: '| abs', desc: 'Absolute value of a number.', example: '{{ context.data.delta | abs }}' },
  { syntax: '| url_encode', desc: 'Percent-encode a string for use in a URL.', example: '{{ context.data.q | url_encode }}' },
  { syntax: '| base64', desc: 'Base64-encode a string.', example: '{{ context.data.payload | base64 }}' },
  { syntax: '| base64_decode', desc: 'Base64-decode a string.', example: '{{ context.data.token | base64_decode }}' },
  {
    syntax: "| replace('old', 'new')",
    desc: 'Replace text. Each argument is a quoted literal or a template path.',
    example: "{{ context.data.path | replace('/', '-') }}",
  },
  {
    syntax: "| default('fallback')",
    desc: 'Use the fallback when the value is null or an empty string.',
    example: "{{ context.data.nickname | default('Guest') }}",
  },
  {
    syntax: "| truncate(20, '…')",
    desc: 'Limit a string to N characters, appending the optional suffix.',
    example: "{{ context.data.bio | truncate(20, '…') }}",
  },
  { syntax: "| join(', ')", desc: 'Join an array into a string with the separator.', example: "{{ context.data.tags | join(', ') }}" },
  { syntax: "| split(',')", desc: 'Split a string into an array on the separator.', example: "{{ context.data.csv | split(',') }}" },
  { syntax: "| hash('sha256')", desc: 'Hex digest of a string (sha256).', example: "{{ context.data.secret | hash('sha256') }}" },
  { syntax: '| round(2)', desc: 'Round a number to N decimal places.', example: '{{ outputs.calc.price | round(2) }}' },
]

// --- 4. Template functions (2) ----------------------------------------------
// template.rs:656-675.
const TEMPLATE_FUNCTIONS: RefEntry[] = [
  { syntax: 'json(value)', desc: 'Serialize a value to a JSON string.', example: '{{ json(outputs.fetch_user) }}', meta: '→ string' },
  { syntax: 'len(value)', desc: 'Length of an array, an object (key count) or a string.', example: '{{ len(context.data.items) }}', meta: '→ integer' },
]

// --- 5. Expression operators ------------------------------------------------
// expression.rs:134-582. Used by router route / loop condition / loop break_on.
const EXPR_OPERATORS: RefEntry[] = [
  { syntax: '==   !=', desc: 'Equality and inequality.', example: "context.data.status == 'active'" },
  { syntax: '>   <   >=   <=', desc: 'Numeric, or lexicographic for strings.', example: 'context.data.count >= 10' },
  { syntax: '&&   ||   !', desc: 'Logical and / or / not.', example: 'context.data.a && !context.data.b' },
  { syntax: '+   -   *   /', desc: 'Arithmetic. + also concatenates when either side is a string.', example: 'outputs.cart.subtotal + outputs.cart.tax' },
  { syntax: 'value in [a, b]', desc: 'Membership test against an array literal or an array path.', example: "context.data.role in ['admin', 'owner']" },
  { syntax: 'cond ? a : b', desc: 'Ternary conditional.', example: "context.data.count > 5 ? 'high' : 'low'" },
  { syntax: 'literals', desc: "Strings 'x' or \"x\", numbers, true, false, null, and arrays [1, 2, 3].", example: "context.data.tier in ['gold', 'platinum']" },
  {
    syntax: 'truthiness',
    desc: 'Only null, false, 0 and "" are falsy — empty [] and {} are truthy. Use len(...) > 0 to test emptiness.',
    example: 'len(context.data.items) > 0',
    meta: 'gotcha',
  },
]

// --- 6. Expression functions (25) -------------------------------------------
// expression.rs:654-875 — exact match arms, grouped for readability.
const EXPR_FUNCTIONS: RefEntry[] = [
  // Basic
  { group: 'Basic', syntax: 'abs(n)', desc: 'Absolute value.', example: 'abs(context.data.delta)' },
  { group: 'Basic', syntax: 'len(x)', desc: 'Length of an array, object or string.', example: 'len(outputs.search.results)' },
  { group: 'Basic', syntax: 'json(x)', desc: 'JSON string of a value.', example: 'json(context.data.payload)' },
  // Generators
  { group: 'Generators', syntax: 'now()', desc: 'Current time as an RFC3339 string.', example: 'now()' },
  { group: 'Generators', syntax: 'uuid()', desc: 'A random UUID v4.', example: 'uuid()' },
  { group: 'Generators', syntax: 'random(min, max)', desc: 'Random integer in [min, max).', example: 'random(1, 100)' },
  // Date / time
  { group: 'Date / time', syntax: 'format_date(iso, fmt)', desc: 'Format an RFC3339 string (strftime; default %Y-%m-%d).', example: "format_date(runtime.started_at, '%Y-%m-%d')" },
  { group: 'Date / time', syntax: 'day_of_week(iso)', desc: 'Day of week, Monday = 0 … Sunday = 6.', example: 'day_of_week(now())' },
  // Strings & collections
  { group: 'Strings & collections', syntax: 'keys(obj)', desc: 'Array of an object’s keys.', example: 'keys(outputs.fetch.headers)' },
  { group: 'Strings & collections', syntax: 'values(obj)', desc: 'Array of an object’s values.', example: 'values(outputs.fetch.headers)' },
  { group: 'Strings & collections', syntax: 'contains(x, needle)', desc: 'Array membership or substring test.', example: "contains(context.data.tags, 'urgent')" },
  { group: 'Strings & collections', syntax: 'count(arr, needle)', desc: 'Count occurrences of a value in an array.', example: "count(context.data.votes, 'yes')" },
  { group: 'Strings & collections', syntax: 'starts_with(s, prefix)', desc: 'Does the string start with the prefix?', example: "starts_with(context.data.path, '/api')" },
  { group: 'Strings & collections', syntax: 'ends_with(s, suffix)', desc: 'Does the string end with the suffix?', example: "ends_with(context.data.file, '.pdf')" },
  // Array operations
  { group: 'Array operations', syntax: 'first(arr)', desc: 'First element, or null.', example: 'first(outputs.search.results)' },
  { group: 'Array operations', syntax: 'last(arr)', desc: 'Last element, or null.', example: 'last(outputs.search.results)' },
  { group: 'Array operations', syntax: 'slice(arr, start, end?)', desc: 'Subarray over [start, end).', example: 'slice(context.data.items, 0, 10)' },
  { group: 'Array operations', syntax: "sort(arr, order?)", desc: "Sort 'asc' (default) or 'desc'.", example: "sort(context.data.scores, 'desc')" },
  { group: 'Array operations', syntax: 'unique(arr)', desc: 'Deduplicate, preserving order.', example: 'unique(context.data.tags)' },
  // Numeric
  { group: 'Numeric', syntax: 'sum(arr)', desc: 'Sum of numeric elements.', example: 'sum(outputs.cart.prices)' },
  { group: 'Numeric', syntax: 'avg(arr)', desc: 'Average of numeric elements.', example: 'avg(context.data.scores)' },
  { group: 'Numeric', syntax: 'min(arr)', desc: 'Minimum element.', example: 'min(context.data.scores)' },
  { group: 'Numeric', syntax: 'max(arr)', desc: 'Maximum element.', example: 'max(context.data.scores)' },
  { group: 'Numeric', syntax: 'change_pct(old, new)', desc: 'Percent change: (new − old) / old × 100.', example: 'change_pct(outputs.prev.price, outputs.cur.price)' },
  { group: 'Numeric', syntax: 'clamp(v, min, max)', desc: 'Constrain a number to a range.', example: 'clamp(context.data.qty, 1, 99)' },
]

/**
 * The full, ordered reference rendered in the "Context" tab. Order follows an
 * author's workflow: what can I read → how does interpolation behave → how do I
 * transform it → how do conditions work. Everything here is something a node can
 * actually access at runtime; environment variables are intentionally absent (see
 * the file header — their values are not readable inside a node).
 */
export const RUNTIME_REFERENCE: RefSection[] = [
  {
    id: 'variables',
    title: 'Template variables',
    blurb: 'Reference these inside any string field with {{ … }} (the engine’s only interpolation syntax). Navigate nested values with dots and index arrays by position.',
    entries: VARIABLES,
  },
  {
    id: 'interpolation',
    title: 'Interpolation behaviour',
    blurb: 'How {{ … }} resolves — typing, fallbacks and missing values.',
    entries: INTERPOLATION,
  },
  {
    id: 'filters',
    title: 'Template filters',
    blurb: 'Transform a resolved value with | pipes; chain them freely, e.g. {{ x | trim | lower }}.',
    entries: FILTERS,
  },
  {
    id: 'template-functions',
    title: 'Template functions',
    blurb: 'Call these inside {{ … }} on a path or value.',
    entries: TEMPLATE_FUNCTIONS,
  },
  {
    id: 'expr-operators',
    title: 'Expression operators',
    blurb: 'Conditions — a router route, a loop condition, a loop break_on — are expressions: template paths plus these operators. Wrapping in {{ }} is optional.',
    note: 'Precedence (high → low): ! and unary − , then * /, then + −, then comparisons, then &&, then ||, then ? : . Parenthesise to be explicit.',
    entries: EXPR_OPERATORS,
  },
  {
    id: 'expr-functions',
    title: 'Expression functions',
    blurb: 'Available inside expressions (and most also inside {{ … }} templates).',
    entries: EXPR_FUNCTIONS,
  },
]

/** Flat list of every section id — handy for tests and anchor navigation. */
export const RUNTIME_REFERENCE_SECTION_IDS = RUNTIME_REFERENCE.map((s) => s.id)
