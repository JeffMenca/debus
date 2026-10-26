import { createEnvelope, exampleUserUpdated } from '@debus/contracts';
import { StaffHandler } from './staff.handler';

const registered = {
  userId: exampleUserUpdated.userId,
  email: exampleUserUpdated.email,
  fullName: exampleUserUpdated.fullName,
  role: 'BRANCH_ADMIN',
  branchId: exampleUserUpdated.branchId,
  profile: null,
};

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    branchAdmin: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { tx, handler: new StaffHandler({} as never) };
}

describe('StaffHandler', () => {
  it('keeps a branch admin when the account is activated, below any later version', async () => {
    const { tx, handler } = setup();

    await handler.registered(
      registered,
      createEnvelope('UserRegistered', registered, 'c'),
      tx as never,
    );

    expect(tx.branchAdmin.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: registered.userId,
          email: registered.email,
          fullName: registered.fullName,
          branchId: registered.branchId,
          active: true,
          version: 0,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('keeps no other role', async () => {
    const { tx, handler } = setup();
    const cashier = { ...registered, role: 'CASHIER' };

    await handler.registered(cashier, createEnvelope('UserRegistered', cashier, 'c'), tx as never);

    expect(tx.branchAdmin.createMany).not.toHaveBeenCalled();
  });

  it('replaces the copy only with a newer version', async () => {
    const { tx, handler } = setup();

    await handler.updated(
      exampleUserUpdated,
      createEnvelope('UserUpdated', exampleUserUpdated, 'c'),
      tx as never,
    );

    const [sql] = tx.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toContain('WHERE branch_admins.version < EXCLUDED.version');
  });

  it('forgets an account that is no longer a branch admin', async () => {
    const { tx, handler } = setup();
    const cashier = { ...exampleUserUpdated, role: 'CASHIER' };

    await handler.updated(cashier, createEnvelope('UserUpdated', cashier, 'c'), tx as never);

    expect(tx.branchAdmin.deleteMany).toHaveBeenCalledWith({ where: { userId: cashier.userId } });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.registered({}, createEnvelope('UserRegistered', {}, 'c'), tx as never),
    ).rejects.toThrow();
    await expect(
      handler.updated({}, createEnvelope('UserUpdated', {}, 'c'), tx as never),
    ).rejects.toThrow();
  });
});
