import { createEnvelope } from '@debus/contracts';
import { AccountLinkHandler } from './account-link.handler';

const payload = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  email: 'ana@correo.com',
  fullName: 'Ana López',
  reason: 'SIGNUP',
  link: 'https://web.example/crear-contrasena?token=secret-token',
  expiresAt: '2026-10-11T18:00:00.000Z',
};

describe('AccountLinkHandler', () => {
  const setup = () => {
    const mailer = { send: jest.fn().mockResolvedValue(undefined) };
    const prisma = { sentEmail: { create: jest.fn().mockResolvedValue({}) } };
    const tx = { sentEmail: { create: jest.fn().mockResolvedValue({}) } };
    const handler = new AccountLinkHandler(mailer, prisma as never);
    return { mailer, prisma, tx, handler };
  };

  it('sends the email and records it without the link', async () => {
    const { mailer, prisma, handler } = setup();
    const envelope = createEnvelope('EnlaceDeCuentaEmitido', payload, 'c');

    await handler.handle(payload, envelope);

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@correo.com', subject: 'Confirma tu correo en debus' }),
    );
    expect(prisma.sentEmail.create).toHaveBeenCalledWith({
      data: { eventId: envelope.eventId, recipient: 'ana@correo.com', template: 'SIGNUP' },
    });
    expect(JSON.stringify(prisma.sentEmail.create.mock.calls)).not.toContain('secret-token');
  });

  it('records the email through the inbox transaction, not a second connection', async () => {
    const { prisma, tx, handler } = setup();
    const envelope = createEnvelope('EnlaceDeCuentaEmitido', payload, 'c');

    await handler.handle(payload, envelope, tx as never);

    expect(tx.sentEmail.create).toHaveBeenCalledTimes(1);
    expect(prisma.sentEmail.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload without sending', async () => {
    const { mailer, handler } = setup();

    await expect(
      handler.handle({ email: 'x' }, createEnvelope('EnlaceDeCuentaEmitido', {}, 'c')),
    ).rejects.toThrow();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('does not record the email when sending fails', async () => {
    const { mailer, prisma, handler } = setup();
    mailer.send.mockRejectedValue(new Error('smtp down'));

    await expect(
      handler.handle(payload, createEnvelope('EnlaceDeCuentaEmitido', payload, 'c')),
    ).rejects.toThrow('smtp down');
    expect(prisma.sentEmail.create).not.toHaveBeenCalled();
  });
});
