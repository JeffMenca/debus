import type { AccountLinkIssuedPayload, UserRegisteredPayload } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp, tokenOf, uniqueEmail } from './support/app';
import { type EventCapture, captureEvents } from './support/events';

describe('accounts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventCapture;
  const signupBody = (email: string) => ({
    fullName: 'Ana López',
    email,
    dpi: '2345 67890 1234',
    phone: '5555-4444',
  });
  const signUp = (email: string, extra: object = {}) =>
    request(app.getHttpServer())
      .post('/auth/signup')
      .send({ ...signupBody(email), ...extra });
  const setPassword = (token: string, password = 'clave-segura-1') =>
    request(app.getHttpServer()).post('/auth/password').send({ token, password });
  const forgotPassword = (email: string) =>
    request(app.getHttpServer()).post('/auth/password/forgot').send({ email }).expect(202);
  const linkStatus = (token: string) =>
    request(app.getHttpServer()).post('/auth/links/status').send({ token });
  const linkFor = (email: string, reason?: string) =>
    events.next<AccountLinkIssuedPayload>(
      'EnlaceDeCuentaEmitido',
      (p) => p.email === email && (!reason || p.reason === reason),
    );
  const tokenFor = async (email: string, reason?: string) =>
    tokenOf((await linkFor(email, reason)).link!);

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('signs up, activates with the emailed link and publishes the new user', async () => {
    const email = uniqueEmail('signup');

    const accepted = await signUp(email).expect(202);
    expect(accepted.body.message).toContain('te enviamos un correo');
    const sent = await linkFor(email, 'SIGNUP');
    const token = tokenOf(sent.link!);
    expect(sent.link).toContain('/crear-contrasena?token=');

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toMatchObject({ status: 'PENDING', passwordHash: null });
    const links = await prisma.accountLink.findMany({ where: { userId: stored!.id } });
    expect(JSON.stringify(links)).not.toContain(token);

    await linkStatus(token).expect(200, { state: 'valid', purpose: 'ACTIVATION' });
    await setPassword(token).expect(204);

    const registered = await events.next<UserRegisteredPayload>(
      'UsuarioRegistrado',
      (p) => p.email === email,
    );
    expect(registered.profile).toEqual({
      dpi: '2345678901234',
      phone: '55554444',
      nit: null,
      address: null,
    });
    await setPassword(token, 'otra-clave-1').expect(409);
    await linkStatus(token).expect(200, { state: 'used', purpose: 'ACTIVATION' });
  });

  it('answers the same to an existing account and only warns its owner', async () => {
    const email = uniqueEmail('dup');
    await signUp(email).expect(202);
    await setPassword(await tokenFor(email, 'SIGNUP')).expect(204);

    const again = await signUp(email).expect(202);

    expect(again.body.message).toContain('te enviamos un correo');
    await linkFor(email, 'ALREADY_REGISTERED');
  });

  it('resets a forgotten password with a one hour link', async () => {
    const email = uniqueEmail('reset');
    await signUp(email).expect(202);
    await setPassword(await tokenFor(email, 'SIGNUP'), 'clave-1-uno').expect(204);

    await forgotPassword(email);
    const reset = await linkFor(email, 'PASSWORD_RESET');

    expect(new Date(reset.expiresAt!).getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
    await setPassword(tokenOf(reset.link!), 'clave-2-dos').expect(204);
  });

  it('keeps silent about unknown emails', async () => {
    const email = uniqueEmail('ghost');

    await forgotPassword(email);

    await events.none<AccountLinkIssuedPayload>('EnlaceDeCuentaEmitido', (p) => p.email === email);
  });

  it('renews an expired link without asking for the email', async () => {
    const email = uniqueEmail('renew');
    await signUp(email).expect(202);
    const first = await tokenFor(email, 'SIGNUP');
    await prisma.accountLink.updateMany({
      where: { user: { email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await setPassword(first).expect(410);
    await request(app.getHttpServer()).post('/auth/links/renew').send({ token: first }).expect(202);

    const renewed = await events.next<AccountLinkIssuedPayload>(
      'EnlaceDeCuentaEmitido',
      (p) => p.email === email && tokenOf(p.link!) !== first,
    );
    await setPassword(tokenOf(renewed.link!)).expect(204);
  });

  it('rejects bad data with a friendly message', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'no-es-correo' })
      .expect(400);

    expect(response.body.message).toBe('Revisa los datos marcados e intenta de nuevo.');
  });

  it('answers 400 to an unknown link', async () => {
    await setPassword('inventado').expect(400);
  });

  it('lets several pending sign ups claim the same NIT and gives it to the first to activate', async () => {
    const nit = String(Date.now()).slice(-10);
    const [firstEmail, secondEmail] = [uniqueEmail('nit-a'), uniqueEmail('nit-b')];
    await signUp(firstEmail, { nit }).expect(202);
    await signUp(secondEmail, { nit }).expect(202);
    const firstToken = await tokenFor(firstEmail, 'SIGNUP');
    const secondToken = await tokenFor(secondEmail, 'SIGNUP');
    expect(await prisma.user.count({ where: { nit } })).toBe(0);

    await setPassword(firstToken).expect(204);
    await setPassword(secondToken).expect(204);

    const first = await events.next<UserRegisteredPayload>(
      'UsuarioRegistrado',
      (p) => p.email === firstEmail,
    );
    const second = await events.next<UserRegisteredPayload>(
      'UsuarioRegistrado',
      (p) => p.email === secondEmail,
    );
    expect(first.profile?.nit).toBe(nit);
    expect(second.profile?.nit).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: firstEmail } })).toMatchObject({ nit });
    expect(await prisma.user.findUnique({ where: { email: secondEmail } })).toMatchObject({
      nit: null,
      status: 'ACTIVE',
    });
  });

  it('activates both accounts when two sign ups with the same NIT activate at the same time', async () => {
    const nit = String(Date.now()).slice(-9);
    const emails = [uniqueEmail('nit-c'), uniqueEmail('nit-d')];
    const tokens: string[] = [];
    for (const email of emails) {
      await signUp(email, { nit }).expect(202);
      tokens.push(await tokenFor(email, 'SIGNUP'));
    }

    const responses = await Promise.all(tokens.map((token) => setPassword(token)));

    expect(responses.map((response) => response.status)).toEqual([204, 204]);
    expect(await prisma.user.count({ where: { nit } })).toBe(1);
  });

  it('answers 202 to every one of five simultaneous sign ups of the same new email', async () => {
    const email = uniqueEmail('twin');

    const responses = await Promise.all(Array.from({ length: 5 }, () => signUp(email)));

    expect(responses.map((response) => response.status)).toEqual([202, 202, 202, 202, 202]);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('sends a new activation link when a pending account signs up again', async () => {
    const email = uniqueEmail('again');
    await signUp(email).expect(202);
    const first = await tokenFor(email, 'SIGNUP');

    await signUp(email, { fullName: 'Ana María López' }).expect(202);

    const second = await events.next<AccountLinkIssuedPayload>(
      'EnlaceDeCuentaEmitido',
      (p) => p.email === email && tokenOf(p.link!) !== first,
    );
    await linkStatus(first).expect(200, { state: 'expired', purpose: 'ACTIVATION' });
    expect(tokenOf(second.link!)).not.toBe(first);
  });

  it('limits a person to three links per hour without telling them', async () => {
    const email = uniqueEmail('limit');
    await signUp(email).expect(202);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await forgotPassword(email);
    }
    await linkFor(email);

    await forgotPassword(email);

    const count = await prisma.accountLink.count({ where: { user: { email } } });
    expect(count).toBe(3);
  });

  it('lets a link be used once even when five requests use it at the same time', async () => {
    const email = uniqueEmail('race');
    await signUp(email).expect(202);
    const token = await tokenFor(email, 'SIGNUP');

    const responses = await Promise.all(Array.from({ length: 5 }, () => setPassword(token)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([204, 409, 409, 409, 409]);
    const registered = await events.count<UserRegisteredPayload>(
      'UsuarioRegistrado',
      (p) => p.email === email,
    );
    expect(registered).toBe(1);
  });

  it('applies only one password when a reset link is used at the same time', async () => {
    const email = uniqueEmail('race-reset');
    await signUp(email).expect(202);
    await setPassword(await tokenFor(email, 'SIGNUP'), 'clave-inicial-1').expect(204);
    await forgotPassword(email);
    const token = await tokenFor(email, 'PASSWORD_RESET');

    const passwords = ['clave-a-1111', 'clave-b-2222', 'clave-c-3333'];
    const responses = await Promise.all(passwords.map((password) => setPassword(token, password)));

    expect(responses.map((response) => response.status).sort()).toEqual([204, 409, 409]);
  });

  it('takes about the same time to answer an existing, a pending and an unknown email', async () => {
    const active = await activeAccount(app, events);
    const pending = uniqueEmail('timing-pending');
    await signUp(pending).expect(202);
    const timeOf = async (email: string) => {
      const startedAt = Date.now();
      await forgotPassword(email);
      return Date.now() - startedAt;
    };

    const times = [
      await timeOf(active.email),
      await timeOf(pending),
      await timeOf(uniqueEmail('timing-unknown')),
    ];

    expect(Math.min(...times)).toBeGreaterThanOrEqual(290);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(150);
  });
});
