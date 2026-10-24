import { createEnvelope, exampleRoute, exampleRouteDeleted } from '@debus/contracts';
import { RoutesHandler } from './routes.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new RoutesHandler(prisma as never) };
};
const envelope = createEnvelope('RouteCreated', {}, 'c');
const sqlOf = (client: { $executeRawUnsafe: jest.Mock }) =>
  String(client.$executeRawUnsafe.mock.calls[0]?.[0]);
const valuesOf = (client: { $executeRawUnsafe: jest.Mock }) =>
  client.$executeRawUnsafe.mock.calls[0]?.slice(1);

describe('RoutesHandler', () => {
  it.each(['routeCreated', 'routeUpdated'] as const)(
    'keeps the newest snapshot of a route that is not deleted on %s',
    async (method) => {
      const { tx, handler } = setup();

      await handler[method](exampleRoute, envelope, tx);

      expect(sqlOf(tx)).toContain('INSERT INTO system_report_routes');
      expect(sqlOf(tx)).toContain(
        'WHERE system_report_routes.version < EXCLUDED.version AND system_report_routes.deleted_at IS NULL',
      );
      expect(valuesOf(tx)).toEqual([
        exampleRoute.routeId,
        exampleRoute.originBranchId,
        exampleRoute.destinationBranchId,
        201.5,
        85,
        true,
        1,
      ]);
    },
  );

  it('leaves a tombstone on RouteDeleted, with the branches when the event names them', async () => {
    const { tx, handler } = setup();
    const deleted = {
      ...exampleRouteDeleted,
      originBranchId: exampleRoute.originBranchId,
      destinationBranchId: exampleRoute.destinationBranchId,
    };

    await handler.routeDeleted(deleted, envelope, tx);

    expect(sqlOf(tx)).toContain('INSERT INTO system_report_routes');
    expect(sqlOf(tx)).toContain('deleted_at = COALESCE(system_report_routes.deleted_at, now())');
    expect(valuesOf(tx)).toEqual([
      deleted.routeId,
      exampleRoute.originBranchId,
      exampleRoute.destinationBranchId,
    ]);
  });

  it('stores a tombstone without branches when an older RouteDeleted names none', async () => {
    const { tx, handler } = setup();

    await handler.routeDeleted(exampleRouteDeleted, envelope, tx);

    expect(valuesOf(tx)).toEqual([exampleRouteDeleted.routeId, null, null]);
  });

  it.each([
    ['routeCreated', { routeId: 'x' }],
    ['routeUpdated', { routeId: 'x' }],
    ['routeDeleted', { routeId: 'x' }],
  ] as const)('rejects a malformed payload on %s without writing', async (method, payload) => {
    const { tx, handler } = setup();

    await expect(handler[method](payload, envelope, tx)).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.routeCreated(exampleRoute, envelope);
    await handler.routeDeleted(exampleRouteDeleted, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
