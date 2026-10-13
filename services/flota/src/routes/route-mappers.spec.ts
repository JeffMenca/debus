import { exampleRoute, routeChangedPayloadSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { toRoute, toRoutePayload } from './route-mappers';

const row = {
  id: exampleRoute.routeId,
  originBranchId: exampleRoute.originBranchId,
  destinationBranchId: exampleRoute.destinationBranchId,
  distanceKm: new Prisma.Decimal('201.5'),
  ticketPrice: new Prisma.Decimal('85.00'),
  active: true,
  hasTrips: false,
  searchText: 'ignored',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('route mappers', () => {
  it('shows a route with the names of its two branches and plain numbers', () => {
    expect(
      toRoute({ ...row, origin: { name: 'Quetzaltenango' }, destination: { name: 'Guatemala' } }),
    ).toEqual({
      id: row.id,
      originBranchId: row.originBranchId,
      originName: 'Quetzaltenango',
      destinationBranchId: row.destinationBranchId,
      destinationName: 'Guatemala',
      distanceKm: 201.5,
      ticketPrice: 85,
      active: true,
      hasTrips: false,
      version: 1,
    });
  });

  it('builds a snapshot that fits the contract of the event', () => {
    expect(routeChangedPayloadSchema.parse(toRoutePayload(row))).toEqual(exampleRoute);
  });
});
