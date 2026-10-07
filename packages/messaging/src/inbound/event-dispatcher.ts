import type { EventEnvelope, EventType } from '@debus/contracts';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { OnEvent } from './on-event.decorator';

type EventHandler = (envelope: EventEnvelope) => unknown;

@Injectable()
export class EventDispatcher implements OnApplicationBootstrap {
  private readonly handlers = new Map<EventType, EventHandler[]>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance: unknown = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      const methods = instance as Record<string, unknown>;
      for (const name of this.scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const method = methods[name];
        if (typeof method !== 'function') continue;
        const type = this.reflector.get(OnEvent, method);
        if (!type) continue;
        const handlers = this.handlers.get(type) ?? [];
        handlers.push((envelope) => method.call(instance, envelope.payload, envelope));
        this.handlers.set(type, handlers);
      }
    }
  }

  async dispatch(envelope: EventEnvelope): Promise<number> {
    const handlers = this.handlers.get(envelope.type) ?? [];
    for (const handler of handlers) await handler(envelope);
    return handlers.length;
  }
}
