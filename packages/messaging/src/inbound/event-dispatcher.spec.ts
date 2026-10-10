import { createEnvelope, type EventEnvelope } from '@debus/contracts';
import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { SqlClient } from '../inbox/sql-inbox-store';
import { EventDispatcher } from './event-dispatcher';
import { OnEvent } from './on-event.decorator';

@Injectable()
class BranchHandler {
  readonly seen: EventEnvelope[] = [];
  readonly clients: unknown[] = [];

  @OnEvent('SucursalCreada')
  onCreated(_payload: unknown, envelope: EventEnvelope, tx?: SqlClient): void {
    this.seen.push(envelope);
    this.clients.push(tx);
  }

  notAHandler(): void {}
}

describe('EventDispatcher', () => {
  async function setup() {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [EventDispatcher, BranchHandler, { provide: 'plain-value', useValue: 42 }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return { app, dispatcher: app.get(EventDispatcher), handler: app.get(BranchHandler) };
  }

  it('routes an envelope to the decorated method', async () => {
    const { app, dispatcher, handler } = await setup();
    const envelope = createEnvelope('SucursalCreada', { id: 1 }, 'c');

    await expect(dispatcher.dispatch(envelope)).resolves.toBe(1);
    expect(handler.seen).toEqual([envelope]);
    await app.close();
  });

  it('passes the transaction client to the handler as a third argument', async () => {
    const { app, dispatcher, handler } = await setup();
    const tx = {} as SqlClient;

    await dispatcher.dispatch(createEnvelope('SucursalCreada', {}, 'c'), tx);

    expect(handler.clients).toEqual([tx]);
    await app.close();
  });

  it('reports zero handlers for types nobody listens to', async () => {
    const { app, dispatcher } = await setup();

    await expect(dispatcher.dispatch(createEnvelope('BoletoVendido', {}, 'c'))).resolves.toBe(0);
    await app.close();
  });
});
