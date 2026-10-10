import type { EventPublisher } from '@debus/messaging';
import type { ServiceClient } from '../upstream/service-client';
import { ProbeService } from './probe.service';

const probeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('ProbeService', () => {
  it('publishes a probe and returns its id', async () => {
    const publish = jest.fn().mockResolvedValue('m-1');
    const probes = new ProbeService({ publish } as unknown as EventPublisher, {} as ServiceClient);

    const created = await probes.emit('c-1');

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ProbeSent',
        eventId: created.probeId,
        correlationId: 'c-1',
      }),
    );
  });

  it('reports per service whether the probe arrived', async () => {
    const get = jest.fn((service: string) => {
      if (service === 'flota') {
        return Promise.resolve(Response.json({ processedAt: '2026-10-06T12:00:01.000Z' }));
      }
      if (service === 'reportes') return Promise.reject(new Error('down'));
      if (service === 'ventas') return Promise.resolve(new Response('', { status: 500 }));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    const probes = new ProbeService({} as EventPublisher, { get } as unknown as ServiceClient);

    const status = await probes.status(probeId, 'c-1');

    expect(status.probeId).toBe(probeId);
    expect(status.services).toHaveLength(7);
    expect(status.services).toContainEqual({
      service: 'flota',
      state: 'received',
      receivedAt: '2026-10-06T12:00:01.000Z',
    });
    expect(status.services).toContainEqual({ service: 'viajes', state: 'pending' });
    expect(status.services).toContainEqual({ service: 'reportes', state: 'unreachable' });
    expect(status.services).toContainEqual({ service: 'ventas', state: 'unreachable' });
    expect(get).toHaveBeenCalledWith('flota', `/events/processed/${probeId}`, 'c-1');
  });
});
