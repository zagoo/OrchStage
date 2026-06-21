/**
 * Per-block-type visual configuration: icon component + accent CSS class.
 * Each block type gets a distinct Lucide icon and a unique accent color.
 *
 * DESIGN_REFERENCE §dag-sequences.md §3 Block Type Taxonomy
 */
import {
  Play,          // step
  GitBranch,     // parallel
  Zap,           // race
  RefreshCw,     // loop
  List,          // for_each
  GitFork,       // router
  Shield,        // try_catch
  ExternalLink,  // sub_sequence
  Shuffle,       // a_b_split
  Lock,          // cancellation_scope
  // handler-specific icons for step sub-types
  Globe,         // http_request
  Brain,         // llm_call
  Wrench,        // tool_call
  Server,        // mcp_call
  Bot,           // agent
  Database,      // memory_store / memory_search
  HardDrive,     // blob_put / blob_get
  Users,         // human_review
  Radio,         // emit_event / send_signal
  Eye,           // query_instance
  Layers,        // set_state / get_state
  Wand2,         // transform
  CheckCircle2,  // assert
  Merge,         // merge_state
  MessageSquare, // log
  Clock,         // sleep
  XCircle,       // fail
  Cpu,           // embed
} from 'lucide-vue-next'
import type { Component, InjectionKey, Ref } from 'vue'
import type { BlockType } from '@/api/types/sequences'
import type { Json } from '@/api/types/common'

/**
 * Which field a canvas node shows as its MAIN (primary) title line. Toggled from
 * the toolbar (see CanvasToolbar / FlowCanvasView) and read by BlockNode via inject.
 *   'id'    → the block id is the title, the descriptive field is the subtitle
 *   'label' → swapped: the descriptive field (handler / sequence name / type) leads
 */
export type NodeTitleField = 'id' | 'label'
export const NODE_TITLE_FIELD: InjectionKey<Ref<NodeTitleField>> = Symbol('node-title-field')

export interface BlockVisual {
  icon: Component
  colorClass: string // Tailwind text-* and bg-*-soft
  label: string
}

// Handler name → specific icon for Step blocks
const HANDLER_ICON: Record<string, Component> = {
  http_request: Globe,
  llm_call: Brain,
  tool_call: Wrench,
  mcp_call: Server,
  agent: Bot,
  memory_store: Database,
  memory_search: Database,
  blob_put: HardDrive,
  blob_get: HardDrive,
  human_review: Users,
  emit_event: Radio,
  send_signal: Radio,
  query_instance: Eye,
  set_state: Layers,
  get_state: Layers,
  delete_state: Layers,
  transform: Wand2,
  assert: CheckCircle2,
  merge_state: Merge,
  log: MessageSquare,
  sleep: Clock,
  fail: XCircle,
  embed: Cpu,
}

/** Icon for a step block, considering handler name first. */
export function stepIcon(handler: string): Component {
  return HANDLER_ICON[handler] ?? Play
}

/** Color class for a step block's handler. */
export function stepColorClass(handler: string): string {
  const colors: Record<string, string> = {
    http_request: 'text-cyan bg-cyan-soft',
    llm_call: 'text-purple bg-purple-soft',
    tool_call: 'text-pink bg-pink-soft',
    mcp_call: 'text-teal bg-teal-soft',
    agent: 'text-accent bg-accent-soft',
    memory_store: 'text-info bg-info-soft',
    memory_search: 'text-info bg-info-soft',
    blob_put: 'text-warning bg-warning-soft',
    blob_get: 'text-warning bg-warning-soft',
    human_review: 'text-success bg-success-soft',
    emit_event: 'text-pink bg-pink-soft',
    send_signal: 'text-pink bg-pink-soft',
    transform: 'text-cyan bg-cyan-soft',
    assert: 'text-success bg-success-soft',
    fail: 'text-danger bg-danger-soft',
  }
  return colors[handler] ?? 'text-muted bg-surface-2'
}

/** Visual config for composite block types. */
export const BLOCK_VISUAL: Record<BlockType, BlockVisual> = {
  step: {
    icon: Play,
    colorClass: 'text-muted bg-surface-2',
    label: 'Step',
  },
  parallel: {
    icon: GitBranch,
    colorClass: 'text-info bg-info-soft',
    label: 'Parallel',
  },
  race: {
    icon: Zap,
    colorClass: 'text-warning bg-warning-soft',
    label: 'Race',
  },
  loop: {
    icon: RefreshCw,
    colorClass: 'text-purple bg-purple-soft',
    label: 'Loop',
  },
  for_each: {
    icon: List,
    colorClass: 'text-cyan bg-cyan-soft',
    label: 'ForEach',
  },
  router: {
    icon: GitFork,
    colorClass: 'text-accent bg-accent-soft',
    label: 'Router',
  },
  try_catch: {
    icon: Shield,
    colorClass: 'text-teal bg-teal-soft',
    label: 'TryCatch',
  },
  sub_sequence: {
    icon: ExternalLink,
    colorClass: 'text-pink bg-pink-soft',
    label: 'SubSequence',
  },
  a_b_split: {
    icon: Shuffle,
    colorClass: 'text-warning bg-warning-soft',
    label: 'ABSplit',
  },
  cancellation_scope: {
    icon: Lock,
    colorClass: 'text-danger bg-danger-soft',
    label: 'CancellationScope',
  },
}

/** Known step handler names offered in the editor's handler picker. */
export const STEP_HANDLERS: string[] = [
  'log',
  'sleep',
  'http_request',
  'llm_call',
  'tool_call',
  'mcp_call',
  'agent',
  'email_send',
  'transform',
  'assert',
  'memory_store',
  'memory_search',
  'blob_put',
  'blob_get',
  'human_review',
  'emit_event',
  'send_signal',
  'query_instance',
  'set_state',
  'get_state',
  'delete_state',
  'merge_state',
  'embed',
  'fail',
  'noop',
]

/**
 * Standard starter `params` template per handler. Selecting a handler in the
 * editor fills the Params JSON with the matching shape, so the type-specific
 * inputs are concrete. The server treats unknown handlers/params leniently
 * (201 + warning), so these are editor scaffolding, not a hard schema.
 */
export const HANDLER_PARAM_TEMPLATE: Record<string, Json> = {
  log: { message: '', level: 'info' },
  sleep: { duration_ms: 1000 },
  // Nested example: headers + query are sub-objects so the full shape is shown.
  http_request: {
    method: 'GET',
    url: 'https://api.example.com/v1/resource',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${secrets.token}' },
    query: { page: 1, limit: 20 },
    body: null,
    timeout_ms: 30000,
  },
  llm_call: {
    model: 'claude-opus-4-8',
    prompt: '',
    system: '',
    max_tokens: 1024,
    temperature: 0.7,
    stop_sequences: [],
  },
  tool_call: { tool: '', arguments: {} },
  mcp_call: { server: '', tool: '', arguments: {} },
  agent: { agent: '', input: {}, tools: [], max_turns: 8 },
  email_send: { template: '', to: '', cc: [], data: {} },
  transform: { expression: '' },
  assert: { condition: '', message: '' },
  memory_store: { key: '', value: null, namespace: 'default' },
  memory_search: { query: '', limit: 10, namespace: 'default' },
  blob_put: { key: '', content: '', content_type: 'application/octet-stream' },
  blob_get: { key: '' },
  // Parallel enumeration: every selectable choice is listed side-by-side.
  human_review: {
    prompt: '',
    choices: [
      { label: 'Approve', value: 'approve' },
      { label: 'Reject', value: 'reject' },
    ],
    allow_comment: true,
  },
  emit_event: { event: '', payload: {} },
  send_signal: { instance_id: '', signal: '', payload: {} },
  query_instance: { instance_id: '' },
  set_state: { key: '', value: null },
  get_state: { key: '' },
  delete_state: { key: '' },
  merge_state: { state: {} },
  embed: { input: '', model: '' },
  fail: { message: '', code: '' },
  noop: {},
}

/**
 * Complete reference examples for the advanced step JSON sub-objects, mirroring
 * the Rust→TS interfaces (RetryPolicy / DelaySpec / SendWindow / ContextAccess /
 * HumanInputDef / EscalationDef) field-for-field, including every nested level
 * and parallel enumeration (e.g. the full `choices` / `days` arrays). These are
 * what the editor's per-field "Insert / Copy example" controls expose, so the
 * complete shape is always available exactly as defined here in source.
 */
export const STEP_JSON_FIELD_EXAMPLE: Record<string, Json> = {
  retry: { max_attempts: 3, initial_backoff: 1, max_backoff: 60, backoff_multiplier: 2 },
  delay: {
    duration: 0,
    business_days_only: false,
    jitter: 0,
    holidays: ['2026-12-25'],
    fire_at_local: '09:00',
    timezone: 'UTC',
  },
  send_window: { start_hour: 9, end_hour: 17, days: [1, 2, 3, 4, 5] },
  context_access: { data: 'all', config: false, audit: false, runtime: false },
  wait_for_input: {
    prompt: 'Approve this step?',
    timeout: 86400,
    escalation_handler: '',
    choices: [
      { label: 'Approve', value: 'approve' },
      { label: 'Reject', value: 'reject' },
    ],
    store_as: 'decision',
    allow_comment: true,
  },
  on_deadline_breach: { handler: '', params: {} },
}

/** State → CSS classes for the live-state ring around a node. */
export const NODE_STATE_RING: Record<string, string> = {
  running: 'ring-2 ring-info animate-pulse',
  waiting: 'ring-2 ring-warning',
  pending: 'ring-1 ring-border',
  completed: 'ring-2 ring-success',
  failed: 'ring-2 ring-danger',
  cancelled: 'ring-1 ring-border',
  skipped: 'ring-1 ring-border opacity-50',
}
