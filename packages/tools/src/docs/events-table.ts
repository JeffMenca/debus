import {
  EVENT_REGISTRY,
  EVENT_TYPES,
  type BackendService,
  type EventProducer,
  type EventType,
} from '@debus/contracts';

const row = (cells: string[]): string => `| ${cells.join(' | ')} |`;

function section(
  title: string,
  column: string,
  types: readonly EventType[],
  other: (type: EventType) => string,
  empty: string,
): string[] {
  if (types.length === 0) return [title, '', empty];
  return [
    title,
    '',
    row(['Evento', column]),
    row(['---', '---']),
    ...types.map((type) => row([`\`${type}\``, other(type)])),
  ];
}

// What a service publishes and what it consumes, straight from the registry of events.
export function eventsTable(service: BackendService | 'gateway'): string {
  const published = EVENT_TYPES.filter((type) => EVENT_REGISTRY[type].publisher === service);
  const consumed = EVENT_TYPES.filter((type) =>
    (EVENT_REGISTRY[type].consumers as readonly string[]).includes(service),
  );
  return [
    ...section(
      '**Publica**',
      'Lo consumen',
      published,
      (type) => EVENT_REGISTRY[type].consumers.join(', '),
      'No publica eventos.',
    ),
    '',
    ...section(
      '**Consume**',
      'Lo publica',
      consumed,
      (type) => EVENT_REGISTRY[type].publisher satisfies EventProducer,
      'No consume eventos.',
    ),
  ].join('\n');
}
