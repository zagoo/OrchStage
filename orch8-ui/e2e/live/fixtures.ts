/**
 * Synthesized DAG datasets for the live suite — built from the UI's OWN block
 * types so the test exercises the exact shapes the editor serializes. Covers
 * linear chains, every block variant, deeply-nested composites, the a_b_split
 * regression, a massive (50+) DAG, and UI-reachable invalid trees.
 */
import { randomUUID } from 'node:crypto'
import { NAMESPACE, TENANT } from './server'
import type {
  BlockDefinition,
  CreateSequenceRequest,
  SequenceStatus,
  StepBlock,
} from '@/api/types/sequences'

const RUN = `e2e-${Date.now().toString(36)}`
let counter = 0
export const uniqueName = (label: string): string => `${RUN}-${label}-${(counter++).toString(36)}`

export function step(id: string, handler = 'noop', extra: Partial<StepBlock> = {}): StepBlock {
  return { type: 'step', id, handler, cancellable: true, ...extra }
}

export function seq(
  name: string,
  blocks: BlockDefinition[],
  status: SequenceStatus = 'draft',
): CreateSequenceRequest {
  return {
    id: randomUUID(),
    tenant_id: TENANT,
    namespace: NAMESPACE,
    name,
    version: 1,
    deprecated: false,
    status,
    blocks,
    created_at: new Date().toISOString(),
  }
}

// ---- valid block-tree fixtures ---------------------------------------------

export const linear = (): BlockDefinition[] => [step('start'), step('enrich'), step('finish')]

/** One of every block type, all required fields populated. */
export const everyType = (): BlockDefinition[] => [
  step('lead'),
  { type: 'parallel', id: 'par', branches: [[step('p1')], [step('p2')]] },
  { type: 'race', id: 'rc', semantics: 'first_to_succeed', branches: [[step('r1')], [step('r2')]] },
  { type: 'loop', id: 'lp', condition: 'ctx.i < 3', body: [step('lb')], max_iterations: 5, continue_on_error: false },
  { type: 'for_each', id: 'fe', collection: 'ctx.items', item_var: 'item', body: [step('fb')], max_iterations: 100 },
  {
    type: 'router',
    id: 'rt',
    routes: [{ condition: 'ctx.flag == true', blocks: [step('rta')] }],
    default: [step('rtd')],
  },
  { type: 'try_catch', id: 'tc', try_block: [step('tct')], catch_block: [step('tcc')], finally_block: [step('tcf')] },
  { type: 'sub_sequence', id: 'sub', sequence_name: 'welcome-campaign' },
  {
    type: 'a_b_split',
    id: 'ab',
    variants: [
      { name: 'control', weight: 70, blocks: [step('aba')] },
      { name: 'variant', weight: 30, blocks: [step('abb')] },
    ],
  },
  { type: 'cancellation_scope', id: 'cs', blocks: [step('csb')] },
]

/** Loop → try_catch → router → for_each → parallel, plus a sibling inner loop. */
export const deeplyNested = (): BlockDefinition[] => [
  {
    type: 'loop',
    id: 'outer',
    condition: 'ctx.again',
    max_iterations: 10,
    continue_on_error: true,
    body: [
      {
        type: 'try_catch',
        id: 'tc',
        try_block: [
          {
            type: 'router',
            id: 'rtr',
            routes: [
              {
                condition: 'ctx.a',
                blocks: [
                  {
                    type: 'for_each',
                    id: 'fe',
                    collection: 'ctx.xs',
                    item_var: 'x',
                    max_iterations: 50,
                    body: [{ type: 'parallel', id: 'par', branches: [[step('deepA')], [step('deepB')]] }],
                  },
                ],
              },
            ],
            default: [step('routeDefault')],
          },
        ],
        catch_block: [step('rescue')],
        finally_block: [step('cleanup')],
      },
      { type: 'loop', id: 'inner', condition: 'ctx.k', max_iterations: 3, continue_on_error: false, body: [step('innerStep')] },
    ],
  },
]

/** The bug regression: an a_b_split block must round-trip against the server. */
export const abSplitOnly = (): BlockDefinition[] => [
  {
    type: 'a_b_split',
    id: 'split',
    variants: [
      { name: 'A', weight: 50, blocks: [step('a1'), step('a2')] },
      { name: 'B', weight: 50, blocks: [step('b1')] },
    ],
  },
]

export const massive = (n = 60): BlockDefinition[] =>
  Array.from({ length: n }, (_, i) => step(`m${i.toString().padStart(3, '0')}`))

// ---- UI-reachable invalid trees (the Save gate must block these) -----------

export const dupIds = (): BlockDefinition[] => [step('dup'), step('dup')]
export const emptyHandler = (): BlockDefinition[] => [step('s1'), step('bad', '')]
export const emptyTree = (): BlockDefinition[] => []
export const emptyVariants = (): BlockDefinition[] => [{ type: 'a_b_split', id: 'ab', variants: [] }]

// Structural minimums the server enforces as HARD 400s — the UI Save gate must
// mirror each (see treeOps.requiredFieldError). Verified against live server.
export const oneVariant = (): BlockDefinition[] => [
  { type: 'a_b_split', id: 'ab', variants: [{ name: 'A', weight: 100, blocks: [step('only')] }] },
]
export const loopEmptyBody = (): BlockDefinition[] => [
  { type: 'loop', id: 'lp', condition: 'ctx.go', body: [], max_iterations: 3, continue_on_error: false },
]
export const forEachEmptyBody = (): BlockDefinition[] => [
  { type: 'for_each', id: 'fe', collection: 'ctx.xs', item_var: 'x', body: [], max_iterations: 3 },
]
export const tryEmpty = (): BlockDefinition[] => [
  { type: 'try_catch', id: 'tc', try_block: [], catch_block: [step('rescue')] },
]
export const cancelScopeEmpty = (): BlockDefinition[] => [
  { type: 'cancellation_scope', id: 'cs', blocks: [] },
]
