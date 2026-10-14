import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { DeadLettersController } from './dead-letters.controller';
import type { DeadLetters } from './dead-letters';

describe('DeadLettersController', () => {
  const deadLetters = {
    list: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    replay: jest.fn().mockResolvedValue({ outcome: 'processed' }),
    discard: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new DeadLettersController(deadLetters as unknown as DeadLetters);

  it('is only for the system admin', () => {
    expect(new Reflector().get('roles', DeadLettersController)).toEqual(['SYSTEM_ADMIN']);
  });

  it('hands every request to the dead-letter service', async () => {
    await expect(controller.list({ limit: 5 })).resolves.toEqual({ items: [], hasMore: false });
    await expect(controller.replay('42')).resolves.toEqual({ outcome: 'processed' });
    await controller.discard('43');

    expect(deadLetters.list).toHaveBeenCalledWith(5);
    expect(deadLetters.replay).toHaveBeenCalledWith('42');
    expect(deadLetters.discard).toHaveBeenCalledWith('43');
  });
});
