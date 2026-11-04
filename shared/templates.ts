import {
  ComponentSchema,
  ProjectSchema,
  RelationshipSchema,
  type Component,
  type ComponentKind,
  type Operation,
  type Project,
  type ProjectSummary,
} from './model'

export const TEMPLATE_CATALOG = [
  {
    id: 'commerce',
    name: 'Commerce platform',
    description: 'A storefront with services, identity, and payments.',
    components: 8,
    category: 'Microservices',
  },
  {
    id: 'saas',
    name: 'SaaS starter',
    description: 'A multi-tenant app with background processing.',
    components: 7,
    category: 'Application',
  },
  {
    id: 'blank',
    name: 'Blank canvas',
    description: 'A clean space for your next big idea.',
    components: 0,
    category: 'From scratch',
  },
] as const
export type TemplateId = (typeof TEMPLATE_CATALOG)[number]['id']
const component = (
  id: string,
  kind: ComponentKind,
  name: string,
  technology: string,
  description: string,
  boundaryId: string | null,
  tags: string[] = [],
): Component =>
  ComponentSchema.parse({
    id,
    kind,
    name,
    technology,
    description,
    boundaryId,
    tags,
    owner: 'Platform team',
  })
const relationship = (
  id: string,
  source: string,
  target: string,
  label: string,
  protocol: string,
  interaction: 'sync' | 'async' = 'sync',
) => RelationshipSchema.parse({ id, source, target, label, protocol, interaction })

export function createProject(
  template: TemplateId = 'commerce',
  name?: string,
  id = `prj_${crypto.randomUUID()}`,
): Project {
  const timestamp = new Date().toISOString()
  let components: Component[] = [],
    relationships: ReturnType<typeof relationship>[] = []
  let positions: Record<string, { x: number; y: number }> = {}
  if (template === 'commerce') {
    components = [
      component(
        'web-client',
        'client',
        'Web storefront',
        'Next.js',
        'The customer-facing shopping experience. Browses products and places orders.',
        null,
        ['public'],
      ),
      component(
        'api-gateway',
        'gateway',
        'API gateway',
        'Kong',
        'Routes authenticated requests to application services. Applies rate limits.',
        'application',
        ['entrypoint'],
      ),
      component(
        'catalog-service',
        'service',
        'Catalog service',
        'Node.js',
        'Owns product discovery, inventory lookup, and catalog search.',
        'application',
        ['core'],
      ),
      component(
        'order-service',
        'service',
        'Order service',
        'TypeScript',
        'Coordinates checkout, creates orders, and integrates with payments.',
        'application',
        ['core'],
      ),
      component(
        'identity-service',
        'service',
        'Identity service',
        'Keycloak',
        'Manages customer authentication, authorization, and session lifecycle.',
        'application',
        ['security'],
      ),
      component(
        'primary-database',
        'database',
        'Commerce database',
        'PostgreSQL',
        'Durable storage for products and orders. Schemas are owned by their services.',
        'data',
        ['persistent'],
      ),
      component(
        'session-store',
        'database',
        'Session store',
        'Redis',
        'Short-lived session and token state with time-based expiry.',
        'data',
        ['ephemeral'],
      ),
      component(
        'payment-provider',
        'external',
        'Payment provider',
        'Stripe',
        'External payment authorization and settlement.',
        null,
        ['third-party'],
      ),
    ]
    relationships = [
      relationship('web-to-gateway', 'web-client', 'api-gateway', 'Requests', 'HTTPS'),
      relationship('gateway-to-catalog', 'api-gateway', 'catalog-service', 'Browse', 'REST'),
      relationship('gateway-to-orders', 'api-gateway', 'order-service', 'Checkout', 'REST'),
      relationship(
        'gateway-to-identity',
        'api-gateway',
        'identity-service',
        'Authenticate',
        'OAuth 2.0',
      ),
      relationship('catalog-to-db', 'catalog-service', 'primary-database', 'Products', 'SQL'),
      relationship('orders-to-db', 'order-service', 'primary-database', 'Orders', 'SQL'),
      relationship('identity-to-sessions', 'identity-service', 'session-store', 'Sessions', 'RESP'),
      relationship('orders-to-payments', 'order-service', 'payment-provider', 'Charge', 'HTTPS'),
    ]
    positions = {
      'web-client': { x: 0, y: 190 },
      'api-gateway': { x: 310, y: 190 },
      'catalog-service': { x: 620, y: 10 },
      'order-service': { x: 620, y: 190 },
      'identity-service': { x: 620, y: 370 },
      'primary-database': { x: 950, y: 85 },
      'session-store': { x: 950, y: 285 },
      'payment-provider': { x: 950, y: 490 },
    }
  }
  if (template === 'saas') {
    components = [
      component(
        'web-app',
        'client',
        'Workspace app',
        'React',
        'The browser interface for tenant workspaces.',
        null,
        ['public'],
      ),
      component(
        'edge-api',
        'gateway',
        'Edge API',
        'Fastify',
        'Authentication and tenant-aware routing.',
        'application',
        ['entrypoint'],
      ),
      component(
        'workspace-service',
        'service',
        'Workspace service',
        'TypeScript',
        'Owns workspace membership, documents, and tenant isolation.',
        'application',
        ['core'],
      ),
      component(
        'job-worker',
        'service',
        'Job worker',
        'Node.js',
        'Processes long-running exports and asynchronous jobs.',
        'application',
        ['worker'],
      ),
      component(
        'workspace-db',
        'database',
        'Workspace database',
        'PostgreSQL',
        'Tenant-scoped application data.',
        'data',
        ['persistent'],
      ),
      component(
        'job-queue',
        'queue',
        'Job queue',
        'RabbitMQ',
        'Durable job delivery with retry and dead-letter support.',
        'data',
        ['async'],
      ),
      component(
        'object-storage',
        'external',
        'Object storage',
        'S3-compatible',
        'Stores exported documents and uploaded assets.',
        null,
        ['storage'],
      ),
    ]
    relationships = [
      relationship('web-edge', 'web-app', 'edge-api', 'Requests', 'HTTPS'),
      relationship('edge-workspace', 'edge-api', 'workspace-service', 'Workspace API', 'REST'),
      relationship('workspace-db', 'workspace-service', 'workspace-db', 'Read / write', 'SQL'),
      relationship('workspace-jobs', 'workspace-service', 'job-queue', 'Enqueue', 'AMQP', 'async'),
      relationship('jobs-worker', 'job-queue', 'job-worker', 'Deliver', 'AMQP', 'async'),
      relationship('worker-db', 'job-worker', 'workspace-db', 'Job status', 'SQL'),
      relationship('worker-storage', 'job-worker', 'object-storage', 'Artifacts', 'HTTPS'),
    ]
    positions = {
      'web-app': { x: 0, y: 170 },
      'edge-api': { x: 310, y: 170 },
      'workspace-service': { x: 620, y: 30 },
      'job-worker': { x: 620, y: 330 },
      'workspace-db': { x: 950, y: 30 },
      'job-queue': { x: 950, y: 240 },
      'object-storage': { x: 950, y: 450 },
    }
  }
  const kinds: ComponentKind[] = ['gateway', 'service']
  return ProjectSchema.parse({
    schemaVersion: 1,
    id,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    name:
      name ??
      (template === 'commerce'
        ? 'Commerce platform'
        : template === 'saas'
          ? 'Workspace SaaS'
          : 'Untitled architecture'),
    description:
      template === 'commerce'
        ? 'A service-oriented storefront, from first click to checkout.'
        : template === 'saas'
          ? 'A multi-tenant workspace with reliable background processing.'
          : 'Every great system starts with a clear idea.',
    components,
    relationships,
    boundaries:
      template === 'blank'
        ? []
        : [
            {
              id: 'application',
              name: 'Application layer',
              type: 'system',
              description: 'Private application network',
            },
            {
              id: 'data',
              name: 'Data layer',
              type: 'trust',
              description: 'Protected persistence and messaging',
            },
          ],
    views: [
      {
        id: 'overview',
        name: 'System overview',
        description: 'The complete picture',
        kinds: [],
        layout: { direction: 'LR', positions },
      },
      {
        id: 'services',
        name: 'Application services',
        description: 'Focus on the application layer',
        kinds,
        layout: { direction: 'LR', positions: structuredClone(positions) },
      },
      {
        id: 'data-flow',
        name: 'Data & messaging',
        description: 'Persistence and asynchronous processing',
        kinds: ['service', 'database', 'queue'],
        layout: { direction: 'LR', positions: structuredClone(positions) },
      },
    ],
  })
}
export function summarizeProject(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    revision: project.revision,
    updatedAt: project.updatedAt,
    componentCount: project.components.length,
    relationshipCount: project.relationships.length,
  }
}
export const RECIPES = [
  {
    id: 'notifications',
    title: 'Add async notifications',
    description: 'Queue events and deliver them with a dedicated service.',
    icon: 'queue',
  },
  {
    id: 'cache',
    title: 'Add a caching layer',
    description: 'Give your busiest service a Redis read cache.',
    icon: 'database',
  },
  {
    id: 'observability',
    title: 'Connect observability',
    description: 'Collect telemetry from your application services.',
    icon: 'external',
  },
] as const
export type RecipeId = (typeof RECIPES)[number]['id']
export function recipePlan(
  project: Project,
  recipeId: RecipeId,
): { summary: string; operations: Operation[]; mode: 'recipe' } {
  const uniqueId = (base: string) => {
    let id = base,
      n = 2
    while (
      project.components.some((c) => c.id === id) ||
      project.relationships.some((r) => r.id === id)
    )
      id = `${base}-${n++}`
    return id
  }
  const app = project.boundaries.find((b) => b.id === 'application')?.id ?? null,
    data = project.boundaries.find((b) => b.id === 'data')?.id ?? null
  const source =
    project.components.find((c) => c.id === 'order-service') ??
    project.components.find((c) => c.kind === 'service')
  if (!source)
    throw new Error(
      'Add an application service first, or start from a template, to use this recipe.',
    )
  let operations: Operation[] = []
  if (recipeId === 'notifications') {
    const queueId = uniqueId('event-queue'),
      serviceId = uniqueId('notification-service')
    operations = [
      {
        op: 'add_component',
        component: component(
          queueId,
          'queue',
          'Event queue',
          'RabbitMQ',
          'Buffers domain events with retries and dead-letter handling.',
          data,
          ['async'],
        ),
        position: { x: 1270, y: 190 },
      },
      {
        op: 'add_component',
        component: component(
          serviceId,
          'service',
          'Notification service',
          'Node.js',
          'Consumes order events and delivers customer notifications.',
          app,
          ['worker'],
        ),
        position: { x: 1580, y: 190 },
      },
      {
        op: 'add_relationship',
        relationship: relationship(
          uniqueId('publish-events'),
          source.id,
          queueId,
          'Order events',
          'AMQP',
          'async',
        ),
      },
      {
        op: 'add_relationship',
        relationship: relationship(
          uniqueId('consume-events'),
          queueId,
          serviceId,
          'Deliver events',
          'AMQP',
          'async',
        ),
      },
    ]
  } else if (recipeId === 'cache') {
    const catalog = project.components.find((c) => c.id === 'catalog-service') ?? source,
      cacheId = uniqueId('read-cache')
    operations = [
      {
        op: 'add_component',
        component: component(
          cacheId,
          'database',
          'Read cache',
          'Redis',
          'A short-lived read-through cache. The primary database remains the source of truth.',
          data,
          ['cache', 'ephemeral'],
        ),
        position: { x: 1270, y: 0 },
      },
      {
        op: 'add_relationship',
        relationship: relationship(
          uniqueId('service-cache'),
          catalog.id,
          cacheId,
          'Cache lookups',
          'RESP',
        ),
      },
    ]
  } else {
    const telemetryId = uniqueId('observability')
    operations = [
      {
        op: 'add_component',
        component: component(
          telemetryId,
          'external',
          'Observability',
          'OpenTelemetry',
          'Collects service traces, metrics, and structured logs.',
          null,
          ['operations'],
        ),
        position: { x: 1270, y: 430 },
      },
      ...project.components
        .filter((c) => c.kind === 'service')
        .slice(0, 25)
        .map((c) => ({
          op: 'add_relationship' as const,
          relationship: relationship(
            uniqueId(`${c.id}-telemetry`),
            c.id,
            telemetryId,
            'Telemetry',
            'OTLP',
            'async',
          ),
        })),
    ]
  }
  return {
    summary: RECIPES.find((r) => r.id === recipeId)!.description,
    operations,
    mode: 'recipe',
  }
}
