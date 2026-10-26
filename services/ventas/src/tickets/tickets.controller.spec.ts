import { TicketsController } from './tickets.controller';

describe('TicketsController', () => {
  it('asks for the history of whoever has the session', async () => {
    const service = { history: jest.fn().mockResolvedValue('page') };
    const controller = new TicketsController(service as never);
    const actor = {
      userId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      role: 'CLIENT' as const,
      branchId: null,
    };
    const query = { page: 1, pageSize: 20 };

    await expect(controller.history(actor, query)).resolves.toBe('page');
    expect(service.history).toHaveBeenCalledWith(actor.userId, query);
  });
});
