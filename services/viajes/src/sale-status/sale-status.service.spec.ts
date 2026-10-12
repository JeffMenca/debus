import { SaleStatusService } from './sale-status.service';

const id = '4c3d2e1f-7a6b-4c5d-8e9f-0a1b2c3d4e5f';

describe('SaleStatusService', () => {
  it('reads the trip and says whether it is open for sale', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id,
          type: 'REGULAR',
          status: 'SCHEDULED',
          departureAt: new Date('2999-01-01T00:00:00Z'),
          ticketPrice: { toNumber: () => 85 },
          capacity: 40,
        }),
      },
    };

    const status = await new SaleStatusService(prisma as never).of(id);

    expect(prisma.trip.findUnique).toHaveBeenCalledWith({ where: { id } });
    expect(status).toMatchObject({ tripId: id, open: true, ticketPrice: 85, capacity: 40 });
  });

  it('says not found for a trip that does not exist', async () => {
    const prisma = { trip: { findUnique: jest.fn().mockResolvedValue(null) } };

    await expect(new SaleStatusService(prisma as never).of(id)).resolves.toEqual({
      tripId: id,
      open: false,
      reason: 'NOT_FOUND',
    });
  });
});
