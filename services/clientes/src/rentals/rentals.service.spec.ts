import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { Rental as RentalRow } from '../generated/prisma/client';
import { RentalsService } from './rentals.service';

const CLIENT = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const BRANCH = '9b2c7a10-1111-4c4c-8888-123456789abc';
const RENTAL = '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c';
const client = { userId: CLIENT, role: 'CLIENT' as const, branchId: null };
const admin = {
  userId: 'a0000000-0000-4000-8000-000000000001',
  role: 'BRANCH_ADMIN' as const,
  branchId: BRANCH,
};
const departureAt = new Date(Date.now() + 3 * 86_400_000);
const trip = {
  branchId: BRANCH,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: departureAt.toISOString(),
  returnAt: null,
  passengers: 35,
  distanceKm: 92,
};

const row = (over: Partial<RentalRow> = {}): RentalRow => ({
  id: RENTAL,
  channel: 'ONLINE',
  status: 'CONFIRMED',
  branchId: BRANCH,
  clientId: CLIENT,
  nit: '45218376',
  clientName: 'Ana López',
  email: 'ana.lopez@correo.com',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt,
  returnAt: null,
  passengers: 35,
  distanceKm: new Prisma.Decimal(92),
  ratePerKm: new Prisma.Decimal(30),
  estimatedPrice: new Prisma.Decimal(2760),
  price: new Prisma.Decimal(2500),
  searchText: '',
  requestedAt: new Date('2026-10-20T15:00:00.000Z'),
  createdById: CLIENT,
  confirmedAt: new Date('2026-10-21T14:00:00.000Z'),
  confirmedById: admin.userId,
  paidOn: null,
  paidAt: null,
  cancelledAt: null,
  ...over,
});

const dataOf = (write: jest.Mock): Record<string, unknown> =>
  (write.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;

// Turns the data Prisma would write into the row it would answer.
const saved = (base: RentalRow, data: Record<string, unknown>): RentalRow => {
  const decimals = ['distanceKm', 'ratePerKm', 'estimatedPrice', 'price'];
  const converted = Object.fromEntries(
    Object.entries(data).map(([field, value]) => [
      field,
      decimals.includes(field) && typeof value === 'number' ? new Prisma.Decimal(value) : value,
    ]),
  );
  return { ...base, ...converted } as RentalRow;
};

const CLIENT_PROFILE = {
  userId: CLIENT,
  role: 'CLIENT',
  fullName: 'Ana López',
  email: 'ana.lopez@correo.com',
  nit: '45218376',
};

function setup(current: RentalRow | null = row()) {
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    rental: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        saved(row(), { requestedAt: new Date(), ...data }),
      ),
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        saved(current ?? row(), data),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: unknown) =>
      typeof work === 'function' ? work(tx) : Promise.all(work as Promise<unknown>[]),
    ),
    clientProfile: {
      findUnique: jest.fn().mockResolvedValue(CLIENT_PROFILE),
    },
    branchCopy: { findUnique: jest.fn().mockResolvedValue({ id: BRANCH, active: true }) },
    rental: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        saved(row(), { requestedAt: new Date(), ...data }),
      ),
      findMany: jest.fn().mockResolvedValue([row()]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const outbox = { add: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  const wallet = {
    debitIn: jest.fn().mockResolvedValue({ movementId: 'm', balance: 100 }),
  };
  const settings = {
    effectiveOn: jest.fn().mockResolvedValue({
      versionId: 'v',
      depreciationPerKm: 1.5,
      rentalRatePerKm: 30,
      effectiveFrom: '2026-10-01',
    }),
  };
  const service = new RentalsService(
    prisma as never,
    outbox as never,
    wallet as never,
    settings as never,
  );
  return { tx, prisma, outbox, wallet, settings, service };
}

describe('RentalsService', () => {
  describe('estimate', () => {
    it('prices the distance with the rate in force today', async () => {
      const { service } = setup();

      expect(await service.estimate(92.5)).toEqual({
        ratePerKm: 30,
        estimatedPrice: 2775,
        effectiveFrom: '2026-10-01',
      });
    });

    it('says when there is no rental rate yet', async () => {
      const { service, settings } = setup();
      settings.effectiveOn.mockResolvedValue(null);

      await expect(service.estimate(92)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('request', () => {
    it('records an online request with the profile, the rate and the estimate', async () => {
      const { service, prisma } = setup();

      const rental = await service.request(client, trip);

      const data = dataOf(prisma.rental.create);
      expect(data).toMatchObject({
        channel: 'ONLINE',
        status: 'REQUESTED',
        branchId: BRANCH,
        clientId: CLIENT,
        nit: '45218376',
        clientName: 'Ana López',
        email: 'ana.lopez@correo.com',
        ratePerKm: 30,
        estimatedPrice: 2760,
        searchText: 'ana lopez 45218376 quetzaltenango panajachel',
        createdById: CLIENT,
      });
      expect(rental).toMatchObject({ status: 'REQUESTED', estimatedPrice: 2760 });
    });

    it('asks only an active branch that exists', async () => {
      const { service, prisma } = setup();
      prisma.branchCopy.findUnique.mockResolvedValueOnce({ id: BRANCH, active: false });
      await expect(service.request(client, trip)).rejects.toThrow(UnprocessableEntityException);
      prisma.branchCopy.findUnique.mockResolvedValueOnce(null);
      await expect(service.request(client, trip)).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.rental.create).not.toHaveBeenCalled();
    });

    it('asks a client without NIT as the final consumer', async () => {
      const { service, prisma } = setup();
      prisma.clientProfile.findUnique.mockResolvedValue({
        userId: CLIENT,
        fullName: 'Ana López',
        email: 'ana@correo.com',
        nit: null,
      });

      await service.request(client, trip);

      expect(dataOf(prisma.rental.create).nit).toBe('CF');
    });

    it('waits for the profile and refuses a departure in the past', async () => {
      const { service, prisma } = setup();

      await expect(
        service.request(client, { ...trip, departureAt: '2020-01-01T10:00:00.000Z' }),
      ).rejects.toThrow(UnprocessableEntityException);
      prisma.clientProfile.findUnique.mockResolvedValue(null);
      await expect(service.request(client, trip)).rejects.toThrow(NotFoundException);
      expect(prisma.rental.create).not.toHaveBeenCalled();
    });
  });

  describe('registerCounter', () => {
    const counter = { ...trip, clientId: CLIENT, price: 2600 };

    it('records it confirmed, in the name of the chosen client', async () => {
      const { service, tx } = setup();

      await service.registerCounter(admin, counter, 'corr');

      expect(dataOf(tx.rental.create)).toMatchObject({
        channel: 'COUNTER',
        status: 'CONFIRMED',
        clientId: CLIENT,
        nit: '45218376',
        clientName: 'Ana López',
        email: 'ana.lopez@correo.com',
        price: 2600,
        estimatedPrice: 2760,
        confirmedById: admin.userId,
        createdById: admin.userId,
        confirmedAt: expect.any(Date),
      });
    });

    it('tells the client in the same transaction, so they can pay from their wallet', async () => {
      const { service, tx, outbox } = setup();

      await service.registerCounter(admin, counter, 'corr');

      expect(outbox.add).toHaveBeenCalledWith(
        tx,
        'RentalConfirmed',
        expect.objectContaining({ clientId: CLIENT, email: 'ana.lopez@correo.com', price: 2600 }),
        'corr',
      );
      expect(outbox.flush).toHaveBeenCalled();
    });

    it('takes the final consumer for a client without a NIT', async () => {
      const { service, prisma, tx } = setup();
      prisma.clientProfile.findUnique.mockResolvedValue({
        ...CLIENT_PROFILE,
        nit: null,
      });

      await service.registerCounter(admin, counter);

      expect(dataOf(tx.rental.create)).toMatchObject({ nit: 'CF' });
    });

    it('refuses a person who is not a client', async () => {
      const { service, prisma, tx } = setup();
      prisma.clientProfile.findUnique.mockResolvedValue({
        ...CLIENT_PROFILE,
        role: 'CASHIER',
      });

      await expect(service.registerCounter(admin, counter)).rejects.toThrow(NotFoundException);
      expect(tx.rental.create).not.toHaveBeenCalled();
    });

    it('refuses a client that does not exist', async () => {
      const { service, prisma } = setup();
      prisma.clientProfile.findUnique.mockResolvedValue(null);

      await expect(service.registerCounter(admin, counter)).rejects.toThrow(NotFoundException);
    });

    it('records rentals only for the own branch', async () => {
      const { service } = setup();

      await expect(
        service.registerCounter(admin, { ...counter, branchId: CLIENT }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirm', () => {
    it('confirms the price and tells an online client, locking the rental first', async () => {
      const { service, tx, outbox } = setup(row({ status: 'REQUESTED', price: null }));

      const rental = await service.confirm(admin, RENTAL, { price: 2500 }, 'corr');

      expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        RENTAL,
      );
      expect(dataOf(tx.rental.update)).toMatchObject({
        status: 'CONFIRMED',
        price: 2500,
        distanceKm: 92,
        estimatedPrice: 2760,
        confirmedById: admin.userId,
      });
      expect(outbox.add).toHaveBeenCalledWith(
        tx,
        'RentalConfirmed',
        expect.objectContaining({ rentalId: RENTAL, price: 2500 }),
        'corr',
      );
      expect(outbox.flush).toHaveBeenCalled();
      expect(rental.status).toBe('CONFIRMED');
    });

    it('recomputes the estimate with the stored rate when the distance is corrected', async () => {
      const { service, tx } = setup(row({ status: 'REQUESTED', price: null }));

      await service.confirm(admin, RENTAL, { price: 2900, distanceKm: 95.5 });

      expect(dataOf(tx.rental.update)).toMatchObject({
        distanceKm: 95.5,
        estimatedPrice: 2865,
      });
    });

    it('sends nothing for a counter rental and refuses one already confirmed', async () => {
      const counter = setup(
        row({ status: 'REQUESTED', price: null, channel: 'COUNTER', clientId: null }),
      );
      await counter.service.confirm(admin, RENTAL, { price: 2500 });
      expect(counter.outbox.add).not.toHaveBeenCalled();

      const confirmed = setup();
      await expect(confirmed.service.confirm(admin, RENTAL, { price: 2500 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to price a rental whose departure already passed', async () => {
      const { service, outbox } = setup(
        row({ status: 'REQUESTED', price: null, departureAt: new Date('2020-01-01T00:00:00Z') }),
      );

      await expect(service.confirm(admin, RENTAL, { price: 2500 })).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(outbox.add).not.toHaveBeenCalled();
    });

    it('hides the rentals of other branches', async () => {
      const { service } = setup(row({ branchId: CLIENT, status: 'REQUESTED', price: null }));

      await expect(service.confirm(admin, RENTAL, { price: 2500 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('pay', () => {
    it('debits the wallet, marks it paid and announces it, in one transaction', async () => {
      const { service, tx, wallet, outbox } = setup();

      const rental = await service.pay(client, RENTAL, RENTAL, { paidOn: '2026-10-21' }, 'corr');

      expect(wallet.debitIn).toHaveBeenCalledWith(tx, CLIENT, RENTAL, {
        kind: 'RENTAL',
        amount: 2500,
        occurredOn: '2026-10-21',
        reference: RENTAL,
        description: 'Alquiler Quetzaltenango - Panajachel',
      });
      expect(dataOf(tx.rental.update)).toMatchObject({
        status: 'PAID',
        paidOn: new Date('2026-10-21T00:00:00.000Z'),
        paidAt: expect.any(Date),
      });
      expect(outbox.add).toHaveBeenCalledWith(
        tx,
        'RentalPaid',
        expect.objectContaining({ rentalId: RENTAL, price: 2500, paidOn: '2026-10-21' }),
        'corr',
      );
      expect(outbox.flush).toHaveBeenCalled();
      expect(rental).toMatchObject({ status: 'PAID', paidOn: '2026-10-21' });
    });

    it('takes the cash of a counter rental without touching any wallet', async () => {
      const { service, wallet, outbox } = setup(
        row({ channel: 'COUNTER', clientId: null, email: null, nit: 'CF' }),
      );

      await service.pay(admin, RENTAL, RENTAL, { paidOn: '2026-10-21' });

      expect(wallet.debitIn).not.toHaveBeenCalled();
      expect(outbox.add).toHaveBeenCalledWith(
        expect.anything(),
        'RentalPaid',
        expect.objectContaining({ clientId: null, email: null }),
        undefined,
      );
    });

    it('answers a retry with what was recorded and refuses one with another day', async () => {
      const paid = row({
        status: 'PAID',
        paidOn: new Date('2026-10-21T00:00:00.000Z'),
        paidAt: new Date(),
      });
      const { service, wallet, outbox } = setup(paid);

      expect(await service.pay(client, RENTAL, RENTAL, { paidOn: '2026-10-21' })).toMatchObject({
        status: 'PAID',
      });
      await expect(service.pay(client, RENTAL, RENTAL, { paidOn: '2026-10-20' })).rejects.toThrow(
        ConflictException,
      );
      expect(wallet.debitIn).not.toHaveBeenCalled();
      expect(outbox.add).not.toHaveBeenCalled();
    });

    it('wants the rental id as the key', async () => {
      const { service } = setup();

      await expect(service.pay(client, RENTAL, CLIENT, { paidOn: '2026-10-21' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an unconfirmed rental, one that left and an online one from the branch', async () => {
      await expect(
        setup(row({ status: 'REQUESTED', price: null })).service.pay(client, RENTAL, RENTAL, {
          paidOn: '2026-10-21',
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        setup(row({ departureAt: new Date('2020-01-01T00:00:00Z') })).service.pay(
          client,
          RENTAL,
          RENTAL,
          { paidOn: '2026-10-21' },
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      await expect(
        setup().service.pay(admin, RENTAL, RENTAL, { paidOn: '2026-10-21' }),
      ).rejects.toThrow(ConflictException);
    });

    it('does not find the rental of somebody else', async () => {
      const { service } = setup(null);

      await expect(service.pay(client, RENTAL, RENTAL, { paidOn: '2026-10-21' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels a rental that is not paid', async () => {
      const { service, tx } = setup();

      const rental = await service.cancel(client, RENTAL);

      expect(dataOf(tx.rental.update)).toEqual({
        status: 'CANCELLED',
        cancelledAt: expect.any(Date),
      });
      expect(rental.status).toBe('CANCELLED');
    });

    it('answers a cancelled rental as it is and refuses a paid one', async () => {
      const cancelled = setup(row({ status: 'CANCELLED', cancelledAt: new Date() }));
      expect((await cancelled.service.cancel(admin, RENTAL)).status).toBe('CANCELLED');
      expect(cancelled.tx.rental.update).not.toHaveBeenCalled();

      const paid = setup(
        row({ status: 'PAID', paidOn: new Date('2026-10-21'), paidAt: new Date() }),
      );
      await expect(paid.service.cancel(client, RENTAL)).rejects.toThrow(ConflictException);
    });
  });

  describe('lists', () => {
    const query = { status: 'all' as const, page: 1, pageSize: 20 };

    it('lists the history of a client with the counter rentals of their NIT', async () => {
      const { service, prisma } = setup();

      const page = await service.history(client, { ...query, status: 'PAID', q: 'pana' });

      expect(prisma.rental.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { OR: [{ clientId: CLIENT }, { clientId: null, nit: '45218376' }] },
            { status: 'PAID', searchText: { contains: 'pana' } },
          ],
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(page).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    });

    it('waits for the profile before listing the history', async () => {
      const { service, prisma } = setup();
      prisma.clientProfile.findUnique.mockResolvedValue(null);

      await expect(service.history(client, query)).rejects.toThrow(NotFoundException);
    });

    it('lists the rentals of the branch by departure, within the days asked', async () => {
      const { service, prisma } = setup();

      await service.branchList(admin, { ...query, from: '2026-10-24', to: '2026-10-24' });

      expect(prisma.rental.findMany).toHaveBeenCalledWith({
        where: {
          branchId: BRANCH,
          departureAt: {
            gte: new Date('2026-10-24T06:00:00.000Z'),
            lt: new Date('2026-10-25T06:00:00.000Z'),
          },
        },
        orderBy: [{ departureAt: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      });
    });
  });
});
