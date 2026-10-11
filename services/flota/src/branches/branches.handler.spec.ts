import { createEnvelope } from '@debus/contracts';
import { BranchesHandler } from './branches.handler';

const payload = {
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
  active: true,
  version: 2,
};

describe('BranchesHandler', () => {
  const setup = () => {
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    return { tx, prisma, handler: new BranchesHandler(prisma as never) };
  };

  it.each(['created', 'updated'] as const)('keeps the newest snapshot on %s', async (method) => {
    const { tx, handler } = setup();

    await handler[method](payload, createEnvelope('BranchUpdated', payload, 'c'), tx);

    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(sql).toContain('WHERE branches.version < EXCLUDED.version');
    expect(values).toEqual([payload.branchId, 'XEL', 'Quetzaltenango', true, 2]);
  });

  it('rejects a malformed payload without writing', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.created({ branchId: 'x' }, createEnvelope('BranchCreated', {}, 'c'), tx),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.created(payload, createEnvelope('BranchCreated', payload, 'c'));

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
