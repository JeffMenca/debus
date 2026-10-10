import { HttpStatus, type HttpException, UnauthorizedException } from '@nestjs/common';
import * as crypto from '../accounts/crypto';
import { hashOpaqueToken, hashPassword } from '../accounts/crypto';
import { SessionsService } from './sessions.service';

const now = new Date('2026-10-09T12:00:00.000Z');
const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const setup = async () => {
  const passwordHash = await hashPassword('clave-segura-1');
  const user = {
    id,
    email: 'ana@correo.com',
    fullName: 'Ana',
    role: 'CLIENT',
    branchId: null,
    status: 'ACTIVE',
    passwordHash,
    failedLoginCount: 0,
    lockedUntil: null,
  };
  // What runs inside the refresh transaction goes through tx, the rest through prisma.
  const tx = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    refreshToken: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
    // Reserving an attempt: one row back means the attempt may be checked, none means locked.
    $queryRaw: jest.fn().mockResolvedValue([{ locked: false }]),
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const tokens = { sign: jest.fn().mockReturnValue('access') };
  return {
    user,
    tx,
    prisma,
    tokens,
    service: new SessionsService(prisma as never, tokens as never),
  };
};

describe('login', () => {
  it('issues an access token and a hashed refresh token', async () => {
    const { prisma, service } = await setup();

    const session = await service.login(
      { email: 'ana@correo.com', password: 'clave-segura-1' },
      now,
    );

    expect(session).toMatchObject({
      accessToken: 'access',
      accessExpiresIn: 900,
      refreshExpiresAt: '2026-10-16T12:00:00.000Z',
      user: { id, role: 'CLIENT', branchId: null },
    });
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(hashOpaqueToken(session.refreshToken));
    expect(stored.familyId).toEqual(expect.any(String));
  });

  it('answers the same for unknown, pending and wrong passwords', async () => {
    const { prisma, user, service } = await setup();
    const attempt = () => service.login({ email: 'ana@correo.com', password: 'mala' }, now);

    await expect(attempt()).rejects.toThrow(
      new UnauthorizedException('El correo o la contraseña no coinciden.'),
    );
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(attempt()).rejects.toThrow(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValueOnce({
      ...user,
      status: 'PENDING',
      passwordHash: null,
    });
    await expect(attempt()).rejects.toThrow(UnauthorizedException);
  });

  it('reserves the attempt in one statement, before checking the password', async () => {
    const { prisma, service } = await setup();

    await expect(service.login({ email: 'ana@correo.com', password: 'mala' }, now)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain('failed_login_count + 1');
    expect(sql).toContain('locked_until IS NULL OR locked_until <=');
    expect(sql).toContain('RETURNING');
    expect(values).toEqual(
      expect.arrayContaining([id, now, 5, new Date('2026-10-09T12:15:00.000Z')]),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers 423 when the attempt that was just reserved is the one that locks', async () => {
    const { prisma, service } = await setup();
    prisma.$queryRaw.mockResolvedValue([{ locked: true }]);

    await expect(
      service.login({ email: 'ana@correo.com', password: 'mala' }, now),
    ).rejects.toMatchObject({ status: HttpStatus.LOCKED });
  });

  it('answers 423 with the same body shape as every other error', async () => {
    const { prisma, service } = await setup();
    prisma.$queryRaw.mockResolvedValue([{ locked: true }]);

    const error = await service
      .login({ email: 'ana@correo.com', password: 'mala' }, now)
      .catch((e: HttpException) => e);

    expect((error as HttpException).getResponse()).toEqual({
      statusCode: 423,
      error: 'Locked',
      message:
        'Por seguridad bloqueamos tu cuenta 15 minutos. Intenta más tarde o restablece tu contraseña.',
    });
  });

  it('refuses without checking the password when no attempt can be reserved', async () => {
    const { prisma, service } = await setup();
    prisma.$queryRaw.mockResolvedValue([]);
    const verify = jest.spyOn(crypto, 'verifyPassword');

    await expect(
      service.login({ email: 'ana@correo.com', password: 'clave-segura-1' }, now),
    ).rejects.toMatchObject({ status: HttpStatus.LOCKED });

    expect(verify).not.toHaveBeenCalled();
    verify.mockRestore();
  });

  it('still spends a decoy check for accounts that cannot log in, without reserving anything', async () => {
    const { prisma, user, service } = await setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      ...user,
      status: 'PENDING',
      passwordHash: null,
    });
    const verify = jest.spyOn(crypto, 'verifyPassword');

    await expect(service.login({ email: 'ana@correo.com', password: 'x' }, now)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(verify).toHaveBeenCalledWith(null, 'x');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    verify.mockRestore();
  });

  it('clears the count and the lock after a good login', async () => {
    const { prisma, service } = await setup();

    await service.login({ email: 'ana@correo.com', password: 'clave-segura-1' }, now);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });
});

describe('refresh', () => {
  const stored = (overrides: object = {}) => ({
    id: 'r1',
    familyId: 'f1',
    userId: id,
    expiresAt: new Date(now.getTime() + 1000),
    usedAt: null,
    revokedAt: null,
    ...overrides,
  });
  const familyRevocation = {
    where: { familyId: 'f1', revokedAt: null },
    data: { revokedAt: now },
  };

  it('rotates the token inside the same family and the same transaction', async () => {
    const { prisma, tx, service } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored());

    const session = await service.refresh('old', now);

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    expect(tx.refreshToken.create.mock.calls[0][0].data.familyId).toBe('f1');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(session.refreshToken).not.toBe('old');
  });

  it('revokes the whole family when a used token comes back', async () => {
    const { prisma, service } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ usedAt: now }));

    await expect(service.refresh('old', now)).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(familyRevocation);
  });

  it('revokes the family, after the winner committed, when it loses a race', async () => {
    const { prisma, tx, service } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored());
    tx.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.refresh('old', now)).rejects.toThrow(UnauthorizedException);

    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(familyRevocation);
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.refreshToken.updateMany.mock.invocationCallOrder[0] as number,
    );
  });

  it('refuses any token of a family that has a revoked token, even a fresh one', async () => {
    const { prisma, tx, service } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValue(stored());
    tx.refreshToken.count.mockResolvedValue(1);

    await expect(service.refresh('fresh', now)).rejects.toThrow(UnauthorizedException);

    expect(tx.refreshToken.count).toHaveBeenCalledWith({
      where: { familyId: 'f1', revokedAt: { not: null } },
    });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('ends sessions that expired, were revoked or belong to inactive users', async () => {
    const { prisma, tx, user, service } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValueOnce(stored({ expiresAt: now }));
    await expect(service.refresh('t', now)).rejects.toThrow(UnauthorizedException);
    prisma.refreshToken.findUnique.mockResolvedValueOnce(stored({ revokedAt: now }));
    await expect(service.refresh('t', now)).rejects.toThrow(UnauthorizedException);
    prisma.refreshToken.findUnique.mockResolvedValueOnce(stored());
    tx.user.findUnique.mockResolvedValueOnce({ ...user, status: 'INACTIVE' });
    await expect(service.refresh('t', now)).rejects.toThrow(UnauthorizedException);
    prisma.refreshToken.findUnique.mockResolvedValueOnce(null);
    await expect(service.refresh('t', now)).rejects.toThrow(UnauthorizedException);

    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('logout and me', () => {
  it('revokes the family and ignores unknown tokens', async () => {
    const { prisma, service } = await setup();
    prisma.refreshToken.findUnique.mockResolvedValueOnce({ familyId: 'f1' });
    await service.logout('t', now);
    prisma.refreshToken.findUnique.mockResolvedValueOnce(null);
    await service.logout('t', now);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('returns the active user', async () => {
    const { prisma, user, service } = await setup();
    expect(await service.me(id)).toEqual({
      id,
      fullName: 'Ana',
      email: 'ana@correo.com',
      role: 'CLIENT',
      branchId: null,
    });
    prisma.user.findUnique.mockResolvedValueOnce({ ...user, status: 'INACTIVE' });
    await expect(service.me(id)).rejects.toThrow(UnauthorizedException);
  });
});
