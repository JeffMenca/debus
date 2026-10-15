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
    const prisma = {
      clientProfile: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn() },
    };
    return { prisma, service: new ProfilesService(prisma as never) };
  };

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

  it('refuses a NIT another account holds and a profile that does not exist', async () => {
    const { prisma, service } = setup();
    const update = { dpi: '2734519200901', phone: '55123489' };

    prisma.clientProfile.update.mockRejectedValueOnce(prismaError('P2002'));
    await expect(service.update(userId, update)).rejects.toThrow(ConflictException);
    prisma.clientProfile.update.mockRejectedValueOnce(prismaError('P2025'));
    await expect(service.update(userId, update)).rejects.toThrow(NotFoundException);
    prisma.clientProfile.update.mockRejectedValueOnce(new Error('down'));
    await expect(service.update(userId, update)).rejects.toThrow('down');
  });
});
