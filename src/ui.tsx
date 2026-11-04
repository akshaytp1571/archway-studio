import {
  Box,
  Braces,
  Database,
  Globe,
  Layers3,
  Monitor,
  Network,
  Server,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentKind } from '../shared/model'

export const KINDS: Record<
  ComponentKind,
  {
    label: string
    plural: string
    icon: LucideIcon
    technology: string
    color: string
    description: string
  }
> = {
  client: {
    label: 'Client',
    plural: 'Clients',
    icon: Monitor,
    technology: 'React',
    color: 'blue',
    description: 'Web, mobile, or desktop experience',
  },
  gateway: {
    label: 'Gateway',
    plural: 'Gateways',
    icon: ShieldCheck,
    technology: 'API gateway',
    color: 'amber',
    description: 'An entrypoint into your system',
  },
  service: {
    label: 'Service',
    plural: 'Services',
    icon: Box,
    technology: 'TypeScript',
    color: 'green',
    description: 'A focused application capability',
  },
  database: {
    label: 'Database',
    plural: 'Databases',
    icon: Database,
    technology: 'PostgreSQL',
    color: 'purple',
    description: 'Persistent data or a read cache',
  },
  queue: {
    label: 'Queue',
    plural: 'Queues',
    icon: Workflow,
    technology: 'RabbitMQ',
    color: 'peach',
    description: 'Asynchronous events and jobs',
  },
  external: {
    label: 'External',
    plural: 'External systems',
    icon: Globe,
    technology: 'External API',
    color: 'pink',
    description: 'An integration outside your system',
  },
}
export const kindEntries = Object.entries(KINDS) as [ComponentKind, (typeof KINDS)[ComponentKind]][]
export function KindIcon({
  kind,
  size = 18,
  className = '',
}: {
  kind: ComponentKind
  size?: number
  className?: string
}) {
  const Icon = KINDS[kind].icon
  return (
    <span className={`kind-icon ${KINDS[kind].color} ${className}`}>
      <Icon size={size} strokeWidth={1.65} />
    </span>
  )
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-symbol ${small ? 'small' : ''}`} aria-hidden="true">
      <svg width="25" height="25" viewBox="0 0 32 32" fill="none">
        <path d="M6 26V15a10 10 0 0 1 20 0v11h-6V15a4 4 0 0 0-8 0v11H6Z" fill="currentColor" />
        <path d="M14 26v-9a2 2 0 0 1 4 0v9" fill="currentColor" opacity=".5" />
      </svg>
    </span>
  )
}
export function EmptyIllustration() {
  return (
    <div className="empty-illustration" aria-hidden="true">
      <span>
        <Monitor size={22} />
      </span>
      <i />
      <span>
        <Server size={25} />
      </span>
      <i />
      <span>
        <Database size={22} />
      </span>
    </div>
  )
}
export function timeAgo(timestamp: string) {
  const delta = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000))
  return delta < 1
    ? 'Just now'
    : delta < 60
      ? `${delta}m ago`
      : delta < 1440
        ? `${Math.floor(delta / 60)}h ago`
        : new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
export const panelIcons = { model: Network, source: Braces, views: Layers3 }
