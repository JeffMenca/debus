import { rentalCancelledPayloadSchema, tripDeletedPayloadSchema } from '@debus/contracts';
import { REQUEST_FLUSH } from '@debus/messaging';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { RentalRequestsService } from './rental-requests.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const rentalId = '5d1f3a20-2222-4d4d-9999-123456789abc';
const tripId = 'f4c3b2a1-0000-4000-8000-000000000000';
const actor = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};
const request = (over: Record<string, unknown> = {}) => ({
  id: rentalId,
  branchId,
  clientName: 'Colegio San José',
  nit: '12345678',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: new Date('2999-10-24T13:00:00.000Z'),
  returnAt: null,
  passengers: 35,
  distanceKm: new Prisma.Decimal('92.0'),
  price: new Prisma.Decimal('2760.00'),
  status: 'PENDING',
  tripId: null,
  cancelledAt: null,
  searchText: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const trip = (status = 'SCHEDULED') => ({
  id: tripId,
  type: 'RENTAL',
  status,
  branchId,
  busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
  driverId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  departureAt: new Date('2999-10-24T13:00:00.000Z'),
  rentalId,
});

function setup(
  current: ReturnType<typeof request> | null,
  assigned: ReturnType<typeof trip> | null = null,
) {
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    rentalRequest: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...current,
        ...data,
      })),
    },
    trip: {
      findUnique: jest.fn().mockResolvedValue(assigned),
      delete: jest.fn().mockResolvedValue(assigned),
    },
  };
  const prisma = { $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)) };
  const outbox = { add: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue({}) };
  const service = new RentalRequestsService(
    prisma as never,
    {} as never,
    outbox as never,
    {} as never,
  );
  return { tx, outbox, service };
}

const published = (outbox: { add: jest.Mock }, type: string) =>
  outbox.add.mock.calls
    .filter(([, eventType]) => eventType === type)
    .map(([, , payload]) => payload);

describe('RentalRequestsService.cancel', () => {
  it('cancels a rental waiting for its bus and announces it, as the pivot of the saga', async () => {
    const { tx, outbox, service } = setup(request());

    const cancelled = await service.cancel(actor, rentalId, 'corr');

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM rental_requests WHERE id = $1::uuid FOR UPDATE'),
      rentalId,
    );
    expect(tx.rentalRequest.update).toHaveBeenCalledWith({
      where: { id: rentalId },
      data: { status: 'CANCELLED', tripId: null, cancelledAt: expect.any(Date) },
    });
    const [event] = published(outbox, 'RentalCancelled');
    expect(rentalCancelledPayloadSchema.parse(event)).toEqual({
      rentalId,
      branchId,
      tripId: null,
      cancelledAt: expect.any(String),
    });
    expect(outbox.add).toHaveBeenCalledWith(tx, 'RentalCancelled', event, 'corr');
    expect(published(outbox, 'TripDeleted')).toEqual([]);
    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('deletes the trip it was given, locking the trip before the rental', async () => {
    const { tx, outbox, service } = setup(request({ status: 'ASSIGNED', tripId }), trip());

    await service.cancel(actor, rentalId);

    const locks = tx.$queryRawUnsafe.mock.calls.map(([sql]) => String(sql));
    expect(locks[0]).toContain('FROM trips WHERE id = $1::uuid FOR UPDATE');
    expect(locks[1]).toContain('FROM rental_requests WHERE id = $1::uuid FOR UPDATE');
    expect(tx.trip.delete).toHaveBeenCalledWith({ where: { id: tripId } });
    const [deleted] = published(outbox, 'TripDeleted');
    expect(tripDeletedPayloadSchema.parse(deleted)).toMatchObject({ tripId, type: 'RENTAL' });
    expect(published(outbox, 'RentalCancelled')).toEqual([
      expect.objectContaining({ rentalId, tripId }),
    ]);
  });

  it('refuses once the trip left, and changes nothing', async () => {
    const { tx, outbox, service } = setup(
      request({ status: 'ASSIGNED', tripId }),
      trip('IN_TRANSIT'),
    );

    await expect(service.cancel(actor, rentalId)).rejects.toThrow(ConflictException);
    expect(tx.trip.delete).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('answers a cancelled rental as it is', async () => {
    const { tx, outbox, service } = setup(
      request({ status: 'CANCELLED', cancelledAt: new Date() }),
    );

    expect((await service.cancel(actor, rentalId)).status).toBe('CANCELLED');
    expect(tx.rentalRequest.update).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('asks to wait while the payment of the rental has not arrived', async () => {
    const { service } = setup(null);

    await expect(service.cancel(actor, rentalId)).rejects.toThrow(NotFoundException);
  });

  it('asks to try again when the rental got or lost its trip meanwhile', async () => {
    const { tx, service } = setup(request());
    tx.rentalRequest.findFirst
      .mockResolvedValueOnce(request())
      .mockResolvedValueOnce(request({ status: 'ASSIGNED', tripId }));

    await expect(service.cancel(actor, rentalId)).rejects.toThrow(ConflictException);
  });
});
