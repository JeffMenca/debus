import { isConstraintViolation } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testProfiles } from './support/profiles';
import { futureDeparture, testRentals } from './support/rentals';

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('rentals schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let profiles: ReturnType<typeof testProfiles>;
  let rentals: ReturnType<typeof testRentals>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    profiles = testProfiles(prisma);
    rentals = testRentals(prisma);
  });
  afterAll(async () => {
    await rentals.cleanUp();
    await profiles.cleanUp();
    await app.close();
  });

  it('ties an online rental to a client and a counter one to none', async () => {
    const clientId = await profiles.create();

    expect(
      isConstraintViolation(
        await refusal(rentals.insert({ channel: 'ONLINE' })),
        'rentals_channel_client',
      ),
    ).toBe(true);
    expect(
      isConstraintViolation(
        await refusal(rentals.insert({ channel: 'COUNTER', clientId })),
        'rentals_channel_client',
      ),
    ).toBe(true);
    await expect(rentals.insert({ channel: 'ONLINE', clientId })).resolves.toBeDefined();
  });

  it('never leaves a confirmed rental without its price, but cancels a request without one', async () => {
    expect(
      isConstraintViolation(
        await refusal(rentals.insert({ status: 'CONFIRMED' })),
        'rentals_price_when_confirmed',
      ),
    ).toBe(true);
    await expect(rentals.insert({ status: 'CANCELLED', price: null })).resolves.toBeDefined();
  });

  it('never marks a rental paid without the day and the moment it was paid', async () => {
    expect(
      isConstraintViolation(
        await refusal(rentals.insert({ status: 'PAID', price: 2760 })),
        'rentals_paid_fields',
      ),
    ).toBe(true);
    expect(
      isConstraintViolation(
        await refusal(
          rentals.insert({ status: 'CONFIRMED', price: 2760, paidOn: new Date('2026-10-21') }),
        ),
        'rentals_paid_fields',
      ),
    ).toBe(true);
    await expect(
      rentals.insert({
        status: 'CANCELLED',
        price: 2760,
        paidOn: new Date('2026-10-21'),
        paidAt: new Date(),
      }),
    ).resolves.toBeDefined();
  });

  it('refuses a return before the departure and amounts that are not positive', async () => {
    const departureAt = futureDeparture();
    expect(
      isConstraintViolation(
        await refusal(rentals.insert({ departureAt, returnAt: departureAt })),
        'rentals_return_after_departure',
      ),
    ).toBe(true);
    expect(
      isConstraintViolation(
        await refusal(rentals.insert({ passengers: 0 })),
        'rentals_positive_amounts',
      ),
    ).toBe(true);
  });

  it('removes the online rentals of a client with the profile', async () => {
    const clientId = await profiles.create();
    const id = await rentals.insert({ channel: 'ONLINE', clientId });

    await prisma.clientProfile.delete({ where: { userId: clientId } });

    expect(await prisma.rental.findUnique({ where: { id } })).toBeNull();
  });
});
