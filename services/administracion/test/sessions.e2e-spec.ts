import { createPublicKey } from 'node:crypto';
import {
  type AccountLinkSentPayload,
  accessTokenClaimsSchema,
  authTokensSchema,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as crypto from '../src/accounts/crypto';
import { generateOpaqueToken } from '../src/accounts/crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp, tokenOf } from './support/app';
import { type EventCapture, captureEvents } from './support/events';

describe('sessions', () => {
  let app: INestApplication;
  let events: EventCapture;
  const login = (credentials: { email: string; password: string }) =>
    request(app.getHttpServer()).post('/auth/login').send(credentials);
  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('logs in with an RS256 access token verifiable with the public key', async () => {
    const account = await activeAccount(app, events);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: account.email.toUpperCase(), password: account.password })
      .expect(200);

    const session = authTokensSchema.parse(response.body);
    const publicKey = createPublicKey(
      (process.env.JWT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    ).export({ type: 'spki', format: 'pem' });
    const claims = new JwtService({ publicKey, verifyOptions: { algorithms: ['RS256'] } }).verify(
      session.accessToken,
    );
    expect(accessTokenClaimsSchema.parse(claims).sub).toBe(account.id);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const account = await activeAccount(app, events);
    const first = (await login(account).expect(200)).body;

    const second = (await refresh(first.refreshToken).expect(200)).body;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await refresh(first.refreshToken).expect(401);
    await refresh(second.refreshToken).expect(401);
  });

  it('logs out', async () => {
    const account = await activeAccount(app, events);
    const server = app.getHttpServer();
    const session = (await login(account).expect(200)).body;

    await request(server)
      .post('/auth/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(204);
    await refresh(session.refreshToken).expect(401);
  });

  it('locks after five wrong passwords', async () => {
    const account = await activeAccount(app, events);
    const wrong = { email: account.email, password: 'equivocada' };

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await login(wrong).expect(401);
    }
    const locked = await login(wrong).expect(423);
    expect(locked.body.message).toContain('bloqueamos tu cuenta 15 minutos');
    expect(locked.body).toMatchObject({ statusCode: 423, error: 'Locked' });
    await login(account).expect(423);
  });

  it('answers me from the gateway identity headers', async () => {
    const account = await activeAccount(app, events);
    const server = app.getHttpServer();

    const me = await request(server)
      .get('/auth/me')
      .set('x-user-id', account.id)
      .set('x-user-role', 'CLIENT')
      .expect(200);
    expect(me.body.email).toBe(account.email);
    await request(server).get('/auth/me').expect(401);
  });

  it('closes every session after a password reset', async () => {
    const account = await activeAccount(app, events);
    const session = (await login(account).expect(200)).body;

    await resetPassword(app, events, account.email);

    await refresh(session.refreshToken).expect(401);
  });

  describe('a burst of simultaneous attempts', () => {
    afterEach(() => jest.restoreAllMocks());

    const wrongPasswordFor = (account: { email: string }) => ({
      email: account.email,
      password: 'equivocada',
    });

    // Counts the passwords actually checked against the account (the decoy check has no hash).
    const spyOnChecks = () => {
      const verify = jest.spyOn(crypto, 'verifyPassword');
      return () => verify.mock.calls.filter(([stored]) => stored !== null).length;
    };

    it('reserves each attempt before checking it: at most five passwords are tried and the account ends locked', async () => {
      const account = await activeAccount(app, events);
      const checked = spyOnChecks();

      // The correct password goes last, after twenty-nine wrong ones.
      const burst = await Promise.all([
        ...Array.from({ length: 29 }, () => login(wrongPasswordFor(account))),
        login(account),
      ]);

      expect(checked()).toBeLessThanOrEqual(5);
      expect(burst.filter((response) => response.status === 200)).toHaveLength(0);
      expect(burst.every((response) => [401, 423].includes(response.status))).toBe(true);
      expect(burst.filter((response) => response.status === 401).length).toBeLessThanOrEqual(4);
      await login(account).expect(423);
    }, 60_000);

    it('refuses the correct password, without checking it, once five attempts have been reserved', async () => {
      const account = await activeAccount(app, events);
      await Promise.all(Array.from({ length: 5 }, () => login(wrongPasswordFor(account))));
      const checked = spyOnChecks();

      const response = await login(account);

      expect(response.status).toBe(423);
      expect(checked()).toBe(0);
    });

    it('lets the correct password in, and clears the count, while attempts remain', async () => {
      const account = await activeAccount(app, events);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await login(wrongPasswordFor(account)).expect(401);
      }

      await login(account).expect(200);

      const stored = await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { id: account.id } });
      expect(stored).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
    });
  });

  it('gives a refresh token to at most one of several simultaneous uses and then ends the family', async () => {
    const account = await activeAccount(app, events);
    const first = (await login(account).expect(200)).body;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => refresh(first.refreshToken)),
    );

    const winners = responses.filter((response) => response.status === 200);
    expect(winners.length).toBeLessThanOrEqual(1);
    expect(responses.filter((response) => response.status === 401)).toHaveLength(
      5 - winners.length,
    );
    // Reuse was detected, so even the token the winner received no longer works.
    for (const winner of winners) {
      await refresh(winner.body.refreshToken).expect(401);
    }
    const family = await app.get(PrismaService).refreshToken.findMany({
      where: { userId: account.id },
    });
    expect(family.length).toBeGreaterThan(0);
    expect(family.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('never revives a family: a token created after its revocation is refused', async () => {
    const account = await activeAccount(app, events);
    const session = (await login(account).expect(200)).body;
    const prisma = app.get(PrismaService);
    const stored = await prisma.refreshToken.findFirstOrThrow({ where: { userId: account.id } });
    // The state a race can leave behind: one token revoked, a newer one of the same family alive.
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId },
      data: { revokedAt: new Date(), usedAt: new Date() },
    });
    const late = generateOpaqueToken();
    await prisma.refreshToken.create({
      data: {
        userId: account.id,
        familyId: stored.familyId,
        tokenHash: late.hash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await refresh(late.token).expect(401);
    expect(session.refreshToken).toBeDefined();
  });
});

async function resetPassword(
  app: INestApplication,
  events: EventCapture,
  email: string,
): Promise<void> {
  await request(app.getHttpServer()).post('/auth/password/forgot').send({ email }).expect(202);
  const sent = await events.next<AccountLinkSentPayload>(
    'AccountLinkSent',
    (p) => p.email === email && p.reason === 'PASSWORD_RESET',
  );
  await request(app.getHttpServer())
    .post('/auth/password')
    .send({ token: tokenOf(sent.link!), password: 'clave-nueva-2' })
    .expect(204);
}
