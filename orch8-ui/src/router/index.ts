import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useConnectionStore } from '@/stores/connection'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    blurb?: string
    /** Planned/owned endpoints — surfaced by the stub page for traceability. */
    endpoints?: string[]
    requiresConnection?: boolean
  }
}

const shellChildren: RouteRecordRaw[] = [
  { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: 'Dashboard' } },

  { path: 'sequences', name: 'sequences', component: () => import('@/views/SequencesView.vue'),
    meta: { title: 'Sequences', blurb: 'Author, version and publish workflow definitions (the DAG templates instances run).', endpoints: ['GET /sequences', 'GET /sequences/by-name', 'GET /sequences/{id}', 'GET /sequences/{id}/versions', 'POST /sequences', 'DELETE /sequences/{id}', 'POST /sequences/{id}/status', 'POST /sequences/{name}/promote', 'POST /sequences/{name}/unpublish'] } },
  { path: 'sequences/:id', name: 'sequence-detail', component: () => import('@/views/SequenceDetailView.vue'), meta: { title: 'Sequence' } },

  { path: 'instances', name: 'instances', component: () => import('@/views/InstancesView.vue'),
    meta: { title: 'Instances', blurb: 'Monitor and operate running workflow executions: retry, signal, pause, cancel, fork.', endpoints: ['GET /instances', 'POST /instances', 'POST /instances/batch', 'POST /instances/batch-action', 'PATCH /instances/bulk/state', 'GET /instances/dlq'] } },
  { path: 'instances/:id', name: 'instance-detail', component: () => import('@/views/InstanceDetailView.vue'), meta: { title: 'Instance' } },

  { path: 'canvas', name: 'canvas', component: () => import('@/views/FlowCanvasView.vue'),
    meta: { title: 'Flow Canvas', blurb: 'Interactive DAG canvas — visualize the block tree, inspect nodes, and edit dependencies.' } },

  { path: 'triggers', name: 'triggers', component: () => import('@/views/TriggersView.vue'),
    meta: { title: 'Triggers', blurb: 'Event triggers that launch instances.', endpoints: ['GET /triggers', 'GET /triggers/{slug}', 'POST /triggers', 'DELETE /triggers/{slug}', 'POST /triggers/{slug}/fire'] } },
  { path: 'cron', name: 'cron', component: () => import('@/views/CronView.vue'),
    meta: { title: 'Cron Schedules', blurb: 'Scheduled, recurring instance creation.', endpoints: ['GET /cron', 'GET /cron/{id}', 'POST /cron', 'PUT /cron/{id}', 'DELETE /cron/{id}', 'GET /cron/{id}/next-fires'] } },

  { path: 'workers', name: 'workers', component: () => import('@/views/WorkersView.vue'),
    meta: { title: 'Workers', blurb: 'External worker fleet, task queue, handler catalog and commands.', endpoints: ['GET /workers', 'GET /workers/tasks', 'POST /workers/commands', 'POST /workers/version-pins'] } },
  { path: 'queues', name: 'queues', component: () => import('@/views/QueuesView.vue'),
    meta: { title: 'Queues & Routing', blurb: 'Queue dispatch configuration and routing rules.', endpoints: ['GET /queues/dispatch', 'POST /queues/dispatch', 'GET /routing-rules', 'POST /routing-rules'] } },
  { path: 'pools', name: 'pools', component: () => import('@/views/PoolsView.vue'),
    meta: { title: 'Resource Pools', blurb: 'Capacity pools and leasable resources.', endpoints: ['GET /pools', 'POST /pools', 'GET /pools/{id}/resources'] } },

  { path: 'approvals', name: 'approvals', component: () => import('@/views/ApprovalsView.vue'),
    meta: { title: 'Approvals', blurb: 'Human-in-the-loop review gates awaiting a decision.', endpoints: ['GET /approvals', 'POST /instances/{id}/signals'] } },
  { path: 'sessions', name: 'sessions', component: () => import('@/views/SessionsView.vue'),
    meta: { title: 'Sessions', blurb: 'Conversational / stateful session records.', endpoints: ['GET /sessions', 'POST /sessions', 'PATCH /sessions/{id}/data', 'PATCH /sessions/{id}/state'] } },

  { path: 'credentials', name: 'credentials', component: () => import('@/views/CredentialsView.vue'),
    meta: { title: 'Credentials', blurb: 'Encrypted secrets referenced by handlers (metadata only on read).', endpoints: ['GET /credentials', 'POST /credentials', 'PATCH /credentials/{id}', 'DELETE /credentials/{id}'] } },
  { path: 'plugins', name: 'plugins', component: () => import('@/views/PluginsView.vue'),
    meta: { title: 'Plugins', blurb: 'grpc:// and wasm:// handler plugins.', endpoints: ['GET /plugins', 'POST /plugins', 'PATCH /plugins/{name}', 'DELETE /plugins/{name}'] } },
  { path: 'pricing', name: 'pricing', component: () => import('@/views/PricingView.vue'),
    meta: { title: 'Model Pricing', blurb: 'Per-token model cost catalog used for usage accounting.' } },

  { path: 'circuit-breakers', name: 'circuit-breakers', component: () => import('@/views/CircuitBreakersView.vue'),
    meta: { title: 'Circuit Breakers', blurb: 'Breaker state (closed/open/half-open) and manual reset.', endpoints: ['GET /circuit-breakers', 'POST /circuit-breakers/{name}/reset'] } },
  { path: 'rollback', name: 'rollback', component: () => import('@/views/RollbackView.vue'),
    meta: { title: 'Rollback Policies', blurb: 'Automated rollback policy configuration and history.', endpoints: ['GET /rollback-policies', 'POST /rollback-policies', 'DELETE /rollback-policies/{name}'] } },
  { path: 'webhooks', name: 'webhooks', component: () => import('@/views/WebhooksView.vue'),
    meta: { title: 'Webhook Outbox', blurb: 'Outbound webhook delivery queue / DLQ with redelivery.', endpoints: ['GET /webhooks/outbox', 'POST /webhooks/outbox/{id}/redeliver', 'DELETE /webhooks/outbox/{id}'] } },
  { path: 'cluster', name: 'cluster', component: () => import('@/views/ClusterView.vue'),
    meta: { title: 'Cluster', blurb: 'Server replicas; drain nodes for maintenance.', endpoints: ['GET /cluster/nodes', 'POST /cluster/nodes/{id}/drain'] } },

  { path: 'usage', name: 'usage', component: () => import('@/views/UsageView.vue'),
    meta: { title: 'Usage', blurb: 'Token/cost usage aggregates.', endpoints: ['GET /usage'] } },
  { path: 'telemetry', name: 'telemetry', component: () => import('@/views/TelemetryView.vue'),
    meta: { title: 'Telemetry', blurb: 'Mobile telemetry ingestion and dashboard queries.', endpoints: ['GET /telemetry/mobile/dashboard'] } },
  { path: 'audit', name: 'audit', component: () => import('@/views/AuditView.vue'),
    meta: { title: 'Audit Log', blurb: 'State-transition and operator audit trail.' } },

  { path: 'mobile', name: 'mobile', component: () => import('@/views/MobileView.vue'),
    meta: { title: 'Mobile Sync', blurb: 'Mobile delta sync, devices, and approval relay (conditional surface).', endpoints: ['GET /mobile/status', 'GET /mobile/devices', 'GET /mobile/approvals', 'POST /mobile/commands'] } },

  { path: 'api-keys', name: 'api-keys', component: () => import('@/views/ApiKeysView.vue'),
    meta: { title: 'API Keys', blurb: 'Tenant/root API key management (admin only).', endpoints: ['GET /api-keys', 'POST /api-keys', 'DELETE /api-keys/{id}'] } },
  { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings', requiresConnection: false } },
]

const routes: RouteRecordRaw[] = [
  { path: '/connect', name: 'connect', component: () => import('@/views/ConnectView.vue'), meta: { title: 'Connect', requiresConnection: false } },
  {
    path: '/',
    component: () => import('@/components/layout/AppShell.vue'),
    children: shellChildren.map((r) => ({ ...r, meta: { requiresConnection: true, ...r.meta } })),
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: 'Not found', requiresConnection: false } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const conn = useConnectionStore()
  if (to.meta.requiresConnection && !conn.configured) {
    return { path: '/connect', query: { redirect: to.fullPath } }
  }
  return true
})

router.afterEach((to) => {
  const t = to.meta.title
  document.title = t ? `${t} · Orch8` : 'Orch8 Console'
})

export default router
