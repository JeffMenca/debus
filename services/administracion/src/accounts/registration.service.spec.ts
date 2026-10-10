import { ConflictException, GoneException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { hashOpaqueToken } from './crypto';
import { RegistrationService } from './registration.service';

const now = new Date('2026-10-09T12:00:00.000Z');
const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const signup = {
  fullName: 'Ana',
  email: 'ana@correo.com',
  dpi: '2345678901234',
  phone: '55554444',
};

const setup = () => {
  const tx = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    accountLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        id,
        role: 'CLIENT',
        createdById: null,
        lastNoticeAt: null,
        ...data,
      })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id, role: 'CLIENT', createdById: null, ...data })),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  const links = {
    issue: jest.fn().mockResolvedValue(true),
    noticeAlreadyRegistered: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue(null),
  };
  const events = {
    userRegistered: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RegistrationService(prisma as never, links as never, events as never);
  return { tx, prisma, links, events, service };
};

const link = (overrides: object = {}) => ({
  id: 'l1',
  purpose: 'ACTIVATION',
  expiresAt: new Date(now.getTime() + 1000),
  usedAt: null,
  user: {
    id,
    email: 'ana@correo.com',
    fullName: 'Ana',
    role: 'CLIENT',
    branchId: null,
    status: 'PENDING',
    createdById: null,
    pendingProfile: { dpi: '2345678901234', phone: '55554444', nit: null, address: null },
  },
  ...overrides,
});

describe('signUp', () => {
  it('creates a pending client without password and sends the sign up link', async () => {
    const { prisma, links, service } = setup();

    await service.signUp({ ...signup, nit: '1234567' }, 'c');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'ana@correo.com',
        fullName: 'Ana',
        role: 'CLIENT',
        pendingProfile: { dpi: '2345678901234', phone: '55554444', nit: '1234567', address: null },
      },
    });
    expect(links.issue).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@correo.com' }),
      'ACTIVATION',
      'SIGNUP',
      'c',
    );
  });

  it('keeps the NIT only in the pending profile, so a pending account never holds it', async () => {
    const { prisma, service } = setup();

    await service.signUp({ ...signup, nit: '1234567' }, 'c');

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('nit');
    expect(prisma.user.create.mock.calls[0][0].data.pendingProfile.nit).toBe('1234567');
  });

  it('treats a concurrent sign up of the same new email as the pending account that won', async () => {
    const { prisma, links, service } = setup();
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id, status: 'PENDING', role: 'CLIENT', createdById: null });

    await expect(service.signUp(signup, 'c')).resolves.toBeUndefined();

    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'SIGNUP', 'c');
  });

  it('does not hide other database errors on sign up', async () => {
    const { prisma, service } = setup();
    prisma.user.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.signUp(signup, 'c')).rejects.toThrow('connection lost');
  });

  it('only warns an active account', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'ACTIVE', lastNoticeAt: null });

    await service.signUp(signup, 'c');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(links.noticeAlreadyRegistered).toHaveBeenCalled();
  });

  it('resends the link to a pending account', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      id,
      status: 'PENDING',
      role: 'CLIENT',
      createdById: null,
    });

    await service.signUp(signup, 'c');

    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'SIGNUP', 'c');
  });

  it('refreshes the name and profile of a pending self sign up', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      id,
      status: 'PENDING',
      role: 'CLIENT',
      createdById: null,
    });

    await service.signUp({ ...signup, nit: '1234567' }, 'c');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id },
      data: {
        fullName: 'Ana',
        pendingProfile: { dpi: '2345678901234', phone: '55554444', nit: '1234567', address: null },
      },
    });
    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'SIGNUP', 'c');
  });

  it.each([
    ['an account an admin created', { role: 'CLIENT', createdById: id }],
    ['a staff account', { role: 'CASHIER', createdById: null }],
  ])('only resends the link for %s, never rewriting its data', async (_label, owner) => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'PENDING', ...owner });

    await service.signUp(signup, 'c');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'INVITATION', 'c');
  });

  it('stays silent for an inactive account', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'INACTIVE' });

    await service.signUp(signup, 'c');

    expect(links.issue).not.toHaveBeenCalled();
    expect(links.noticeAlreadyRegistered).not.toHaveBeenCalled();
  });

  it('invites the first system admin as an invitation even without a creator', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({
      id,
      status: 'PENDING',
      role: 'SYSTEM_ADMIN',
      createdById: null,
    });

    await service.signUp(signup, 'c');

    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'INVITATION', 'c');
  });
});

describe('setPassword', () => {
  const input = { token: 't', password: 'clave-segura-1' };

  it('activates a pending account and publishes the profile', async () => {
    const { tx, links, events, service } = setup();
    links.find.mockResolvedValue(link());

    await service.setPassword(input, 'c', now);

    const update = tx.user.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id, status: 'PENDING' });
    expect(update.data).toMatchObject({
      status: 'ACTIVE',
      activatedAt: now,
      pendingProfile: Prisma.JsonNull,
    });
    expect(update.data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(events.flush).toHaveBeenCalled();
    expect(events.userRegistered).toHaveBeenCalledWith(
      tx,
      {
        userId: id,
        email: 'ana@correo.com',
        fullName: 'Ana',
        role: 'CLIENT',
        branchId: null,
        profile: { dpi: '2345678901234', phone: '55554444', nit: null, address: null },
      },
      'c',
    );
  });

  it('uses the link only if no one else did, in the same transaction as the change', async () => {
    const { tx, links, service } = setup();
    links.find.mockResolvedValue(link());

    await service.setPassword(input, 'c', now);

    expect(tx.accountLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
  });

  it('answers 409 and changes nothing when the link was used a moment earlier', async () => {
    const { tx, links, events, service } = setup();
    links.find.mockResolvedValue(link());
    tx.accountLink.updateMany.mockResolvedValue({ count: 0 });
    tx.accountLink.findUnique.mockResolvedValue({
      usedAt: now,
      expiresAt: new Date(now.getTime() + 1000),
    });

    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(ConflictException);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(events.userRegistered).not.toHaveBeenCalled();
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('answers 410 when the link expired between the check and the change', async () => {
    const { tx, links, service } = setup();
    links.find.mockResolvedValue(link());
    tx.accountLink.updateMany.mockResolvedValue({ count: 0 });
    tx.accountLink.findUnique.mockResolvedValue({ usedAt: null, expiresAt: now });

    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(GoneException);
  });

  it('refuses when the account stopped being pending after the link was claimed', async () => {
    const { tx, links, events, service } = setup();
    links.find.mockResolvedValue(link());
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(ConflictException);
    expect(events.userRegistered).not.toHaveBeenCalled();
  });

  it('writes the NIT on the account at activation and publishes it', async () => {
    const { tx, links, events, service } = setup();
    const profile = { dpi: '2345678901234', phone: '55554444', nit: '1234567', address: null };
    links.find.mockResolvedValue(link({ user: { ...link().user, pendingProfile: profile } }));

    await service.setPassword(input, 'c', now);

    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { nit: '1234567' } });
    expect(tx.user.updateMany.mock.calls[0][0].data.nit).toBe('1234567');
    expect(events.userRegistered.mock.calls[0][1].profile).toEqual(profile);
  });

  it('activates without the NIT when an account already holds it', async () => {
    const { tx, links, events, service } = setup();
    const profile = { dpi: '2345678901234', phone: '55554444', nit: '1234567', address: 'Zona 1' };
    links.find.mockResolvedValue(link({ user: { ...link().user, pendingProfile: profile } }));
    tx.user.findUnique.mockResolvedValue({ id: 'other', status: 'ACTIVE' });

    await service.setPassword(input, 'c', now);

    expect(tx.user.updateMany.mock.calls[0][0].data.nit).toBeNull();
    expect(events.userRegistered.mock.calls[0][1].profile).toEqual({ ...profile, nit: null });
  });

  it('tries again without the NIT when another activation took it at the same time', async () => {
    const { prisma, tx, links, events, service } = setup();
    const profile = { dpi: '2345678901234', phone: '55554444', nit: '1234567', address: null };
    links.find.mockResolvedValue(link({ user: { ...link().user, pendingProfile: profile } }));
    prisma.$transaction
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      )
      .mockImplementation((fn) => fn(tx));
    tx.user.findUnique.mockResolvedValue({ id: 'other', status: 'ACTIVE' });

    await service.setPassword(input, 'c', now);

    expect(events.userRegistered.mock.calls[0][1].profile.nit).toBeNull();
  });

  it('does not retry unexpected database errors', async () => {
    const { prisma, links, service } = setup();
    links.find.mockResolvedValue(link());
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));

    await expect(service.setPassword(input, 'c', now)).rejects.toThrow('connection lost');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('resets a password and closes every session', async () => {
    const { tx, links, events, service } = setup();
    links.find.mockResolvedValue(
      link({ purpose: 'PASSWORD_RESET', user: { ...link().user, status: 'ACTIVE' } }),
    );

    await service.setPassword({ token: 't', password: 'clave-segura-2' }, 'c', now);

    expect(tx.accountLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    expect(tx.user.updateMany.mock.calls[0][0].where).toEqual({ id, status: 'ACTIVE' });
    expect(tx.user.updateMany.mock.calls[0][0].data).toMatchObject({
      failedLoginCount: 0,
      lockedUntil: null,
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    });
    expect(events.userRegistered).not.toHaveBeenCalled();
  });

  it('changes nothing on a reset whose link was used a moment earlier', async () => {
    const { tx, links, service } = setup();
    links.find.mockResolvedValue(
      link({ purpose: 'PASSWORD_RESET', user: { ...link().user, status: 'ACTIVE' } }),
    );
    tx.accountLink.updateMany.mockResolvedValue({ count: 0 });
    tx.accountLink.findUnique.mockResolvedValue({ usedAt: now, expiresAt: now });

    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(ConflictException);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('explains invalid, used and expired links', async () => {
    const { links, service } = setup();

    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(BadRequestException);
    links.find.mockResolvedValue(link({ usedAt: now }));
    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(ConflictException);
    links.find.mockResolvedValue(link({ expiresAt: now }));
    await expect(service.setPassword(input, 'c', now)).rejects.toThrow(GoneException);
  });
});

describe('links', () => {
  it('reports the state and purpose of a link', async () => {
    const { links, service } = setup();
    links.find.mockResolvedValue(link({ expiresAt: now }));

    expect(await service.linkStatus('t', now)).toEqual({ state: 'expired', purpose: 'ACTIVATION' });
    links.find.mockResolvedValue(null);
    expect(await service.linkStatus('t', now)).toEqual({ state: 'invalid' });
  });

  it('renews an expired link without asking for the email', async () => {
    const { links, service } = setup();
    links.find.mockResolvedValue(link({ expiresAt: now }));

    await service.renewLink('t', 'c', now);

    expect(links.issue).toHaveBeenCalledWith(expect.anything(), 'ACTIVATION', 'SIGNUP', 'c', now);
  });

  it('refuses to renew a used link', async () => {
    const { links, service } = setup();
    links.find.mockResolvedValue(link({ usedAt: now }));

    await expect(service.renewLink('t', 'c', now)).rejects.toThrow(ConflictException);
  });
});

describe('forgotPassword', () => {
  it('sends a reset link to active accounts and an activation link to pending ones', async () => {
    const { prisma, links, service } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'ACTIVE' });
    await service.forgotPassword('ana@correo.com', 'c');
    prisma.user.findUnique.mockResolvedValueOnce({ id, status: 'PENDING', createdById: id });
    await service.forgotPassword('ana@correo.com', 'c');

    expect(links.issue.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      ['PASSWORD_RESET', 'PASSWORD_RESET'],
      ['ACTIVATION', 'INVITATION'],
    ]);
  });

  it('does nothing for unknown emails', async () => {
    const { links, service } = setup();
    await service.forgotPassword('nadie@correo.com', 'c');
    expect(links.issue).not.toHaveBeenCalled();
  });
});

it('never stores the raw token', () => {
  expect(hashOpaqueToken('t')).not.toBe('t');
});

describe('link edge cases', () => {
  it('ignores unknown links when renewing', async () => {
    const { links, service } = setup();

    await service.renewLink('t', 'c', now);

    expect(links.issue).not.toHaveBeenCalled();
  });

  it('renews a password reset link only while the account is active', async () => {
    const { links, service } = setup();
    const reset = link({
      purpose: 'PASSWORD_RESET',
      expiresAt: now,
      user: { ...link().user, status: 'ACTIVE' },
    });
    links.find.mockResolvedValue(reset);
    await service.renewLink('t', 'c', now);
    links.find.mockResolvedValue({ ...reset, user: { ...reset.user, status: 'INACTIVE' } });
    await service.renewLink('t', 'c', now);

    expect(links.issue).toHaveBeenCalledTimes(1);
    expect(links.issue).toHaveBeenCalledWith(
      expect.anything(),
      'PASSWORD_RESET',
      'PASSWORD_RESET',
      'c',
      now,
    );
  });

  it('does not renew an activation link once the account is no longer pending', async () => {
    const { links, service } = setup();
    links.find.mockResolvedValue(
      link({ expiresAt: now, user: { ...link().user, status: 'ACTIVE' } }),
    );

    await service.renewLink('t', 'c', now);

    expect(links.issue).not.toHaveBeenCalled();
  });

  it('refuses a link whose account changed state since it was issued', async () => {
    const { tx, links, service } = setup();
    links.find.mockResolvedValue(link({ user: { ...link().user, status: 'INACTIVE' } }));

    await expect(
      service.setPassword({ token: 't', password: 'clave-segura-1' }, 'c', now),
    ).rejects.toThrow(ConflictException);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('activates staff accounts without publishing a client profile', async () => {
    const { events, links, service } = setup();
    links.find.mockResolvedValue(link({ user: { ...link().user, role: 'CASHIER' } }));

    await service.setPassword({ token: 't', password: 'clave-segura-1' }, 'c', now);

    expect(events.userRegistered.mock.calls[0][1]).toMatchObject({
      role: 'CASHIER',
      profile: null,
    });
  });
});
