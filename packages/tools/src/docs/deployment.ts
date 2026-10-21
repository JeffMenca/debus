import {
  BACKEND_SERVICES,
  EVENT_REGISTRY,
  EVENT_TYPES,
  SYNC_CALLS,
  deadLetterTopicName,
  subscriptionName,
  topicName,
  type BackendService,
  type EventProducer,
} from '@debus/contracts';

type Unit = BackendService | 'gateway';

const id = (text: string): string => text.replace(/[^A-Za-z0-9]/g, '_');
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

// Who listens to what a unit publishes, and whom it listens to, from the registry of events.
function consumersOf(unit: Unit): BackendService[] {
  return unique(
    EVENT_TYPES.filter((type) => EVENT_REGISTRY[type].publisher === unit).flatMap(
      (type) => EVENT_REGISTRY[type].consumers,
    ),
  );
}

function producersOf(unit: BackendService): EventProducer[] {
  return unique(
    EVENT_TYPES.filter((type) =>
      (EVENT_REGISTRY[type].consumers as readonly string[]).includes(unit),
    ).map((type) => EVENT_REGISTRY[type].publisher),
  );
}

function gatewayDiagram(): string {
  const lines = ['flowchart LR', '  web["Cloud Run web"] --> gateway["Cloud Run gateway"]'];
  for (const service of BACKEND_SERVICES) {
    lines.push(`  gateway -->|HTTP| ${id(service)}["Cloud Run ${service}"]`);
  }
  lines.push(
    `  gateway --> probes[("${topicName('gateway')}")]`,
    '  probes -.->|ProbeSent| fanout["los 7 servicios"]',
  );
  return lines.join('\n');
}

// The calls between services are written in English in the contract; the manual says them in Spanish.
const CALL_TEXT: Readonly<Record<string, string>> = {
  'ventas->clientes': 'Cobrar con la cartera del cliente',
  'ventas->viajes': 'Ver si el viaje está abierto a la venta',
  'viajes->flota': 'Ver si el bus y el chofer están disponibles',
};

// Only these calls exist in the code today. A call that is in the contract but not here is drawn
// dotted until the service that makes it is written: add its call here when it is.
const WORKING_CALLS = new Set(['viajes->flota', 'ventas->viajes', 'ventas->clientes']);

// The jobs, besides the outbox flush, that Cloud Scheduler runs on a service.
const EXTRA_JOBS: Readonly<Partial<Record<Unit, readonly { name: string; path: string }[]>>> = {
  ventas: [{ name: 'purchase-recovery', path: '/internal/purchases/recover' }],
  notificaciones: [
    { name: 'email-flush', path: '/internal/emails/flush' },
    { name: 'license-alerts', path: '/internal/license-alerts/run' },
  ],
};

const node = (name: string): string => `n_${id(name)}`;

// The pieces around one service: where it runs, its database, its topic and subscriptions, the
// queue for what fails and the job that flushes its outbox, plus the synchronous calls. Every
// service is drawn once, whatever the number of ways it is related to the one in the middle.
export function deploymentDiagram(unit: Unit): string {
  if (unit === 'gateway') return gatewayDiagram();
  const defined = new Set<string>();
  // The first mention of a node carries its label; later ones are just its id.
  const ref = (name: string, label: string): string => {
    if (defined.has(name)) return node(name);
    defined.add(name);
    return `${node(name)}["${label}"]`;
  };
  const running = (name: string): string => ref(name, `Cloud Run ${name}`);
  const lines = [
    'flowchart LR',
    `  ${running(unit)} --> ${ref(`db ${unit}`, `Cloud SQL ${unit}`)}`,
    `  ${ref(`job ${unit}`, `Cloud Scheduler ${unit}-outbox-flush`)} -->|POST /outbox/flush| ${node(unit)}`,
  ];
  for (const extraJob of EXTRA_JOBS[unit] ?? []) {
    lines.push(
      `  ${ref(`job ${extraJob.name}`, `Cloud Scheduler ${unit}-${extraJob.name}`)} -->|POST ${extraJob.path}| ${node(unit)}`,
    );
  }
  const listeners = consumersOf(unit);
  if (listeners.length > 0) {
    lines.push(`  ${node(unit)} -->|outbox| ${ref(`topic ${unit}`, topicName(unit))}`);
    for (const consumer of listeners) {
      const name = subscriptionName(consumer, unit);
      lines.push(
        `  ${node(`topic ${unit}`)} --> ${ref(name, name)}`,
        `  ${node(name)} -.->|push| ${running(consumer)}`,
      );
    }
  }
  for (const producer of producersOf(unit)) {
    const name = subscriptionName(unit, producer);
    lines.push(
      `  ${running(producer)} -.-> ${ref(name, name)}`,
      `  ${node(name)} -->|push /events/pubsub| ${node(unit)}`,
    );
  }
  lines.push(
    `  ${node(unit)} -.->|tras 5 entregas fallidas| ${ref(`dlq ${unit}`, deadLetterTopicName(unit))}`,
  );
  for (const call of SYNC_CALLS) {
    const key = `${call.from}->${call.to}`;
    const text = CALL_TEXT[key] ?? call.purpose;
    const edge = WORKING_CALLS.has(key) ? `-->|"HTTP: ${text}"|` : `-.->|"HTTP prevista: ${text}"|`;
    if (call.from === unit) lines.push(`  ${node(unit)} ${edge} ${running(call.to)}`);
    else if (call.to === unit) lines.push(`  ${running(call.from)} ${edge} ${node(unit)}`);
  }
  return lines.join('\n');
}
