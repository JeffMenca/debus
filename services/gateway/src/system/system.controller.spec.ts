import { PATH_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
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

  it('serves the English public routes and tags them for the docs', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SystemController)).toBe('api/system');
    expect(Reflect.getMetadata(DECORATORS.API_TAGS, SystemController)).toEqual(['system']);
    expect(Reflect.getMetadata(PATH_METADATA, SystemController.prototype.check)).toBe('status');
    expect(Reflect.getMetadata(PATH_METADATA, SystemController.prototype.emit)).toBe('probes');
    expect(Reflect.getMetadata(PATH_METADATA, SystemController.prototype.probe)).toBe(
      'probes/:probeId',
    );
  });

  it('documents the success of each route in English', () => {
    const description = (handler: object, status: number) =>
      (
        Reflect.getMetadata(DECORATORS.API_RESPONSE, handler) as Record<
          string,
          { description: string }
        >
      )[status]?.description;

    expect(description(SystemController.prototype.check, 200)).toBe(
      'Health of the gateway and every service.',
    );
    expect(description(SystemController.prototype.emit, 202)).toBe(
      'Probe accepted; its id is returned to follow the delivery.',
    );
    expect(description(SystemController.prototype.probe, 200)).toBe(
      'Which services received the probe so far.',
    );
  });

  it('asks for a bearer token and a system admin on the whole controller', () => {
    expect(Reflect.getMetadata(DECORATORS.API_SECURITY, SystemController)).toEqual([
      { bearer: [] },
    ]);
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, SystemController) as Record<
      string,
      unknown
    >;
    expect(Object.keys(responses).sort()).toEqual(['401', '403']);
    expect(Reflect.getMetadata(DECORATORS.API_OPERATION, SystemController.prototype.check)).toEqual(
      expect.objectContaining({ description: 'Allowed roles: SYSTEM_ADMIN.' }),
    );
  });
});
