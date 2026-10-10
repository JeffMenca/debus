import { Prisma } from '../generated/prisma/client';
import { BootstrapAdmin } from './bootstrap-admin';

const setup = (email: string | null, existing = 0) => {
  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'a', ...data })),
    },
  };
  const links = { issue: jest.fn().mockResolvedValue(true) };
  const settings = { privateKey: 'k', webUrl: 'w', bootstrapAdminEmail: email };
  return {
    prisma,
    links,
    bootstrap: new BootstrapAdmin(prisma as never, settings, links as never),
  };
};

describe('BootstrapAdmin', () => {
  it('creates and invites the first system admin', async () => {
    const { prisma, links, bootstrap } = setup('admin@debus.gt');

    expect(await bootstrap.ensureSystemAdmin()).toBe('created');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'admin@debus.gt', fullName: 'Administración', role: 'SYSTEM_ADMIN' },
    });
    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'INVITATION');
  });

  it('does nothing when an admin exists or no email is configured', async () => {
    expect(await setup('admin@debus.gt', 1).bootstrap.ensureSystemAdmin()).toBe('exists');
    expect(await setup(null).bootstrap.ensureSystemAdmin()).toBe('skipped');
  });

  it('keeps booting when the email cannot be sent', async () => {
    const { links, bootstrap } = setup('admin@debus.gt');
    links.issue.mockRejectedValue(new Error('pubsub down'));

    await expect(bootstrap.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('treats a concurrent creation by another instance as already existing', async () => {
    const { prisma, links, bootstrap } = setup('admin@debus.gt');
    prisma.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );

    expect(await bootstrap.ensureSystemAdmin()).toBe('exists');
    expect(links.issue).not.toHaveBeenCalled();
  });

  it('fails clearly when the configured email belongs to an account that is not an admin', async () => {
    const { prisma, bootstrap } = setup('admin@debus.gt');
    prisma.user.count.mockResolvedValue(0);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );

    await expect(bootstrap.ensureSystemAdmin()).rejects.toThrow(
      'BOOTSTRAP_ADMIN_EMAIL belongs to an account that is not a system admin',
    );
  });

  it('logs that error on start without stopping the service', async () => {
    const { prisma, bootstrap } = setup('admin@debus.gt');
    prisma.user.count.mockResolvedValue(0);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    const error = jest.spyOn(bootstrap['logger'], 'error').mockImplementation();

    await expect(bootstrap.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('not a system admin'));
  });

  it('does not hide unexpected database errors', async () => {
    const { prisma, bootstrap } = setup('admin@debus.gt');
    prisma.user.create.mockRejectedValue(new Error('connection lost'));

    await expect(bootstrap.ensureSystemAdmin()).rejects.toThrow('connection lost');
  });

  it('reports what happened when the application starts', async () => {
    const { bootstrap } = setup('admin@debus.gt', 1);
    const ensure = jest.spyOn(bootstrap, 'ensureSystemAdmin');

    await bootstrap.onApplicationBootstrap();

    expect(ensure).toHaveBeenCalledTimes(1);
  });
});
