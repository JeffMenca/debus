import { AccountLinksService, linkUrl } from './account-links.service';
import { hashOpaqueToken } from './crypto';

const now = new Date('2026-10-09T12:00:00.000Z');
const user = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  email: 'ana@correo.com',
  fullName: 'Ana',
};

const setup = (linksThisHour = 0) => {
  const tx = {
    accountLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    accountLink: { count: jest.fn().mockResolvedValue(linksThisHour), findUnique: jest.fn() },
    $transaction: jest.fn((fn) => fn(tx)),
  };
  const events = {
    linkSent: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const settings = { webUrl: 'http://web', privateKey: 'k', bootstrapAdminEmail: null };
  return {
    tx,
    prisma,
    events,
    service: new AccountLinksService(prisma as never, settings, events as never),
  };
};

describe('linkUrl', () => {
  it('points each purpose to its page', () => {
    expect(linkUrl('http://web', 'ACTIVATION', 't')).toBe('http://web/crear-contrasena?token=t');
    expect(linkUrl('http://web', 'PASSWORD_RESET', 't')).toBe('http://web/restablecer?token=t');
  });
});

describe('AccountLinksService.issue', () => {
  it('expires older live links, stores only the hash and queues the link in the same transaction', async () => {
    const { tx, events, service } = setup();

    expect(await service.issue(user, 'ACTIVATION', 'SIGNUP', 'c', now)).toBe(true);

    expect(tx.accountLink.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, purpose: 'ACTIVATION', usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    const created = tx.accountLink.create.mock.calls[0][0].data;
    expect(events.linkSent.mock.calls[0][0]).toBe(tx);
    expect(events.linkSent.mock.calls[0][2]).toBe('c');
    expect(events.flush).toHaveBeenCalled();
    const sent = events.linkSent.mock.calls[0][1];
    const token = new URL(sent.link).searchParams.get('token')!;
    expect(created.tokenHash).toBe(hashOpaqueToken(token));
    expect(JSON.stringify(created)).not.toContain(token);
    expect(sent).toMatchObject({
      userId: user.id,
      reason: 'SIGNUP',
      expiresAt: '2026-10-11T12:00:00.000Z',
    });
  });

  it('stops after three links in an hour', async () => {
    const { events, service } = setup(3);

    expect(await service.issue(user, 'PASSWORD_RESET', 'PASSWORD_RESET', 'c', now)).toBe(false);
    expect(events.linkSent).not.toHaveBeenCalled();
  });
});

describe('AccountLinksService.noticeAlreadyRegistered', () => {
  it('warns at most once per hour', async () => {
    const { tx, events, service } = setup();

    await service.noticeAlreadyRegistered({ ...user, lastNoticeAt: null }, 'c', now);
    await service.noticeAlreadyRegistered({ ...user, lastNoticeAt: now }, 'c', now);

    expect(events.linkSent).toHaveBeenCalledTimes(1);
    expect(events.linkSent.mock.calls[0][1]).toMatchObject({ reason: 'ALREADY_REGISTERED' });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastNoticeAt: now },
    });
  });
});

describe('AccountLinksService.find', () => {
  it('looks the link up by the hash of the token with its user', async () => {
    const { prisma, service } = setup();
    prisma.accountLink.findUnique.mockResolvedValue({ id: 'l1' });

    expect(await service.find('raw-token')).toEqual({ id: 'l1' });
    expect(prisma.accountLink.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashOpaqueToken('raw-token') },
      include: { user: true },
    });
  });
});
