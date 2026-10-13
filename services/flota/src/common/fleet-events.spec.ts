import { REQUEST_FLUSH } from '@debus/messaging';
import { FleetEvents } from './fleet-events';

describe('FleetEvents', () => {
  const setup = () => {
    const outbox = { add: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue({}) };
    return { outbox, events: new FleetEvents(outbox as never) };
  };

  it('writes bus, driver and route events in the caller transaction', async () => {
    const { outbox, events } = setup();
    const tx = {} as never;

    await events.bus(tx, 'BusAdded', { busId: 'b' } as never, 'c');
    await events.driver(tx, 'DriverUpdated', { driverId: 'd' } as never, 'c');
    await events.route(tx, 'RouteDeleted', { routeId: 'r' }, 'c');

    expect(outbox.add).toHaveBeenNthCalledWith(1, tx, 'BusAdded', { busId: 'b' }, 'c');
    expect(outbox.add).toHaveBeenNthCalledWith(2, tx, 'DriverUpdated', { driverId: 'd' }, 'c');
    expect(outbox.add).toHaveBeenNthCalledWith(3, tx, 'RouteDeleted', { routeId: 'r' }, 'c');
  });

  it('flushes with the short request budget', async () => {
    const { outbox, events } = setup();

    await events.flush();

    expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
  });
});
