import type { ProbeService } from './probe.service';
import { SystemController } from './system.controller';
import type { SystemStatusService } from './system-status.service';

describe('SystemController', () => {
  it('delegates to the services with the correlation id', async () => {
    const status = { check: jest.fn().mockResolvedValue('status') };
    const probes = {
      emit: jest.fn().mockResolvedValue('created'),
      status: jest.fn().mockResolvedValue('probe'),
    };
    const controller = new SystemController(
      status as unknown as SystemStatusService,
      probes as unknown as ProbeService,
    );

    await expect(controller.check('c')).resolves.toBe('status');
    await expect(controller.emit('c')).resolves.toBe('created');
    await expect(controller.probe('id', 'c')).resolves.toBe('probe');
    expect(probes.status).toHaveBeenCalledWith('id', 'c');
  });
});
