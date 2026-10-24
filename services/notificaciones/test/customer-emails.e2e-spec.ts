import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import {
  exampleRentalConfirmed,
  exampleRentalPaid,
  exampleTicketSold,
  exampleWalletCredited,
} from '@debus/contracts';
import { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { findMail, mailHtml } from './mailpit';
import { createIsolatedApp } from './support/isolated-app';
import { type IsolatedSchema, isolatedSchema } from './support/isolated-schema';
import { drainQueue } from './support/queue';

let isolated: IsolatedSchema;
let app: INestApplication;
let prisma: PrismaService;
let bus: InMemoryEventBus;

const newTrip = () => randomUUID();
const sold = (tripId: string, over: Record<string, unknown> = {}) => ({
  ...exampleTicketSold,
  ticketId: randomUUID(),
  tripId,
  buyerName: 'Ana Méndez',
  email: testEmail('boleto'),
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: '2026-10-25T05:30:00.000Z',
  ...over,
});
const deleted = (tripId: string) => ({
  tripId,
  type: 'REGULAR',
  branchId: exampleTicketSold.branchId,
  busId: exampleTicketSold.busId,
  driverId: randomUUID(),
  departureAt: '2026-10-25T05:30:00.000Z',
});

beforeAll(async () => {
  isolated = await isolatedSchema('customer_emails');
  app = await createIsolatedApp(isolated);
  prisma = app.get(PrismaService);
  bus = InMemoryEventBus.attach(app);
});

afterAll(async () => {
  await app?.close();
  await isolated?.drop();
});

describe('emails to clients', () => {
  it('confirms a purchase once, even when the sale is published again', async () => {
    const ticket = sold(newTrip());

    await bus.deliver('TicketSold', ticket);
    await bus.deliver('TicketSold', ticket);
    await drainQueue(app);

    const messages = await findMail(ticket.email);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.Subject).toBe('Tu boleto para Quetzaltenango - Guatemala');
    expect(await mailHtml(messages[0]!.ID)).toContain('24 de octubre de 2026 a las 11:30');
  });

  it('warns every buyer of a deleted trip, with the words of their channel', async () => {
    const tripId = newTrip();
    const online = sold(tripId);
    const counter = sold(tripId, {
      channel: 'COUNTER',
      clientId: null,
      email: testEmail('ventanilla'),
      buyerName: 'Luis Pérez',
    });
    await bus.deliver('TicketSold', online);
    await bus.deliver('TicketSold', counter);

    await bus.deliver('TripDeleted', deleted(tripId));
    await bus.deliver('TripDeleted', deleted(tripId));
    await drainQueue(app);

    const [toOnline] = (await findMail(online.email)).filter((m) => m.Subject.includes('canceló'));
    const [toCounter] = (await findMail(counter.email)).filter((m) =>
      m.Subject.includes('canceló'),
    );
    expect(toOnline?.Subject).toBe('Se canceló tu viaje a Guatemala');
    expect(await mailHtml(toOnline!.ID)).toContain('a tu saldo');
    expect(await mailHtml(toCounter!.ID)).toContain('ventanilla');
    expect(await findMail(online.email)).toHaveLength(2);
    expect(await prisma.ticketCopy.count({ where: { tripId } })).toBe(0);
  });

  it('sends only the cancellation for a sale that arrives after its trip was deleted', async () => {
    const tripId = newTrip();
    const late = sold(tripId);

    await bus.deliver('TripDeleted', deleted(tripId));
    await bus.deliver('TicketSold', late);
    await drainQueue(app);

    const messages = await findMail(late.email);
    expect(messages.map((m) => m.Subject)).toEqual(['Se canceló tu viaje a Guatemala']);
    expect(await prisma.ticketCopy.count({ where: { tripId } })).toBe(0);
  });

  it('tells the client about a top-up and a refund, each once', async () => {
    const email = testEmail('saldo');
    const topUp = { ...exampleWalletCredited, movementId: randomUUID(), email };
    const refund = {
      ...topUp,
      movementId: randomUUID(),
      kind: 'REFUND',
      amount: 85,
      balanceAfter: 220.5,
      description: 'Devolución: Boleto Quetzaltenango - Guatemala, asiento 5',
    };

    await bus.deliver('WalletCredited', topUp);
    await bus.deliver('WalletCredited', refund);
    await bus.deliver('WalletCredited', refund);
    await drainQueue(app);

    const subjects = (await findMail(email)).map((m) => m.Subject).sort();
    expect(subjects).toHaveLength(2);
    expect(subjects[0]).toMatch(/^Recargaste Q\s?100\.00 a tu saldo$/);
    expect(subjects[1]).toMatch(/^Te devolvimos Q\s?85\.00 a tu saldo$/);
  });

  it('confirms a paid rental only when there is somewhere to send it', async () => {
    const email = testEmail('alquiler');
    await bus.deliver('RentalPaid', { ...exampleRentalPaid, rentalId: randomUUID(), email });
    await bus.deliver('RentalPaid', { ...exampleRentalPaid, rentalId: randomUUID(), email: null });
    await drainQueue(app);

    expect((await findMail(email)).map((m) => m.Subject)).toEqual(['Tu alquiler está confirmado']);
  });

  it('tells the client once that the price of the rental is ready', async () => {
    const email = testEmail('cotizacion');
    const confirmed = { ...exampleRentalConfirmed, rentalId: randomUUID(), email };
    await bus.deliver('RentalConfirmed', confirmed);
    await bus.deliver('RentalConfirmed', confirmed);
    await drainQueue(app);

    expect((await findMail(email)).map((m) => m.Subject)).toEqual(['Tu cotización está lista']);
  });
});
