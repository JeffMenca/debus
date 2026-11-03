import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

const userId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const row = {
  userId,
  email: 'ana@correo.com',
  fullName: 'Ana Méndez',
  role: 'CLIENT',
  dpi: '2734519200901',
  phone: '55123489',
  nit: null,
  address: null,
  createdAt: new Date('2026-10-14T15:00:00.000Z'),
  updatedAt: new Date('2026-10-14T16:00:00.000Z'),
};
const prismaError = (code: string) => Object.assign(new Error(code), { code });

describe('ProfilesService', () => {
  const setup = () => {
    const tx = { clientProfile: { update: jest.fn() } };
    const prisma = {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: tx.clientProfile.update,
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn((work: unknown) =>
        typeof work === 'function' ? work(tx) : Promise.all(work as Promise<unknown>[]),
      ),
    };
    const outbox = { add: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue({}) };
    return { prisma, tx, outbox, service: new ProfilesService(prisma as never, outbox as never) };
  };

  describe('clientOptions', () => {
    it('pages the clients by name, with only what identifies each one', async () => {
      const { service, prisma } = setup();

      const page = await service.clientOptions({ page: 2, pageSize: 10 });

      expect(page).toEqual({
        items: [{ userId, fullName: row.fullName, email: row.email, nit: null }],
        total: 1,
        page: 2,
        pageSize: 10,
      });
      expect(prisma.clientProfile.findMany).toHaveBeenCalledWith({
        where: { role: 'CLIENT' },
        orderBy: [{ fullName: 'asc' }, { userId: 'asc' }],
        skip: 10,
        take: 10,
      });
    });

    it('searches the folded text, taking wildcards as plain characters', async () => {
      const { service, prisma } = setup();

      await service.clientOptions({ page: 1, pageSize: 20, q: '50%' });

      const where = { role: 'CLIENT', searchText: { contains: '50\\%' } };
      expect(prisma.clientProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.clientProfile.count).toHaveBeenCalledWith({ where });
    });
  });

  it('answers the profile without internal fields', async () => {
    const { service } = setup();

    expect(await service.get(userId)).toEqual({
      userId,
      email: row.email,
      fullName: row.fullName,
      dpi: row.dpi,
      phone: row.phone,
      nit: null,
      address: null,
      updatedAt: '2026-10-14T16:00:00.000Z',
    });
  });

  it('says the account is being prepared while UserRegistered has not arrived', async () => {
    const { prisma, service } = setup();
    prisma.clientProfile.findUnique.mockResolvedValue(null);

    await expect(service.get(userId)).rejects.toThrow(NotFoundException);
  });

  it('saves the edited fields and clears the optional ones left blank', async () => {
    const { prisma, service } = setup();
    prisma.clientProfile.update.mockResolvedValue({ ...row, nit: '45218376' });

    const saved = await service.update(userId, {
      dpi: '2734519200901',
      phone: '55123489',
      nit: '45218376',
    });

    expect(prisma.clientProfile.update).toHaveBeenCalledWith({
      where: { userId },
      data: { dpi: '2734519200901', phone: '55123489', nit: '45218376', address: null },
    });
    expect(saved.nit).toBe('45218376');
  });

  it('tells ventas the new NIT in the same transaction, then publishes it right away', async () => {
    const { tx, outbox, service } = setup();
    tx.clientProfile.update.mockResolvedValue({ ...row, nit: '45218376' });

    await service.update(
      userId,
      { dpi: '2734519200901', phone: '55123489', nit: '45218376' },
      'c-1',
    );

    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'ProfileUpdated',
      {
        clientId: userId,
        nit: '45218376',
        fullName: 'Ana Méndez',
        updatedAt: '2026-10-14T16:00:00.000Z',
      },
      'c-1',
    );
    expect(outbox.flush).toHaveBeenCalledWith({ limit: 10, budgetMs: 2000 });
  });

  it('refuses a NIT another account holds and a profile that does not exist', async () => {
    const { prisma, outbox, service } = setup();
    const update = { dpi: '2734519200901', phone: '55123489' };

    prisma.clientProfile.update.mockRejectedValueOnce(prismaError('P2002'));
    await expect(service.update(userId, update)).rejects.toThrow(ConflictException);
    prisma.clientProfile.update.mockRejectedValueOnce(prismaError('P2025'));
    await expect(service.update(userId, update)).rejects.toThrow(NotFoundException);
    prisma.clientProfile.update.mockRejectedValueOnce(new Error('down'));
    await expect(service.update(userId, update)).rejects.toThrow('down');
    expect(outbox.add).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });
});
