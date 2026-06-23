/**
 * Navigation information architecture for the Orch8 console.
 * Each destination maps to an Orch8 domain (see DESIGN_REFERENCE §Domain map).
 * Icons are Lucide components — every entity/domain gets a distinct glyph.
 */
import type { Component } from 'vue'
import {
  LayoutDashboard,
  Workflow,
  Boxes,
  Waypoints,
  Zap,
  CalendarClock,
  Server,
  Network,
  Layers,
  UserCheck,
  MessagesSquare,
  KeyRound,
  Plug,
  Coins,
  ShieldAlert,
  Undo2,
  Webhook,
  ServerCog,
  ChartBar,
  Activity,
  ScrollText,
  Smartphone,
  KeySquare,
  Settings,
} from 'lucide-vue-next'

export interface NavItem {
  label: string
  to: string
  icon: Component
  /** Match path exactly (used for the dashboard root). */
  exact?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Orchestration',
    items: [
      { label: 'Sequences', to: '/sequences', icon: Workflow },
      { label: 'Instances', to: '/instances', icon: Boxes },
      { label: 'Flow Canvas', to: '/canvas', icon: Waypoints },
      { label: 'Triggers', to: '/triggers', icon: Zap },
      { label: 'Cron Schedules', to: '/cron', icon: CalendarClock },
    ],
  },
  {
    label: 'Execution',
    items: [
      { label: 'Workers', to: '/workers', icon: Server },
      { label: 'Queues & Routing', to: '/queues', icon: Network },
      { label: 'Resource Pools', to: '/pools', icon: Layers },
    ],
  },
  {
    label: 'Human-in-the-loop',
    items: [
      { label: 'Approvals', to: '/approvals', icon: UserCheck },
      { label: 'Sessions', to: '/sessions', icon: MessagesSquare },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Credentials', to: '/credentials', icon: KeyRound },
      { label: 'Plugins', to: '/plugins', icon: Plug },
      { label: 'Model Pricing', to: '/pricing', icon: Coins },
    ],
  },
  {
    label: 'Reliability',
    items: [
      { label: 'Circuit Breakers', to: '/circuit-breakers', icon: ShieldAlert },
      { label: 'Rollback Policies', to: '/rollback', icon: Undo2 },
      { label: 'Webhook Outbox', to: '/webhooks', icon: Webhook },
      { label: 'Cluster', to: '/cluster', icon: ServerCog },
    ],
  },
  {
    label: 'Observability',
    items: [
      { label: 'Usage', to: '/usage', icon: ChartBar },
      { label: 'Telemetry', to: '/telemetry', icon: Activity },
      { label: 'Audit Log', to: '/audit', icon: ScrollText },
    ],
  },
  {
    label: 'Edge',
    // '/edge/mobile', not '/mobile': the latter is shadowed by the engine's root
    // /mobile/* routes on a hard refresh (proxy forwards /mobile*).
    items: [{ label: 'Mobile Sync', to: '/edge/mobile', icon: Smartphone }],
  },
  {
    label: 'System',
    items: [
      // '/admin/api-keys', not '/api-keys': the latter is shadowed by the engine's
      // root-mounted /api-keys REST endpoint on a hard refresh (proxy forwards /api*).
      { label: 'API Keys', to: '/admin/api-keys', icon: KeySquare },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
]
