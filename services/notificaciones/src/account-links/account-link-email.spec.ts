import type { AccountLinkSentPayload } from '@debus/contracts';
import { accountLinkEmail } from './account-link-email';

const base = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  email: 'ana@correo.com',
  fullName: 'Ana López',
  link: 'https://web.example/crear-contrasena?token=abc',
  expiresAt: '2026-10-11T18:00:00.000Z',
};

describe('account link email', () => {
  it('invites with a create password button', () => {
    const mail = accountLinkEmail({ ...base, reason: 'INVITATION' });

    expect(mail.to).toBe('ana@correo.com');
    expect(mail.subject).toBe('Te damos la bienvenida a debus');
    expect(mail.html).toContain('Crear mi contraseña');
    expect(mail.html).toContain(base.link);
    expect(mail.text).toContain('11 de octubre de 2026');
  });

  it('confirms a sign up', () => {
    expect(accountLinkEmail({ ...base, reason: 'SIGNUP' }).subject).toBe(
      'Confirma tu correo en debus',
    );
  });

  it('resets a password', () => {
    const mail = accountLinkEmail({
      ...base,
      reason: 'PASSWORD_RESET',
      link: 'https://web.example/restablecer?token=abc',
    });

    expect(mail.subject).toBe('Restablece tu contraseña de debus');
    expect(mail.html).toContain('Elegir nueva contraseña');
    expect(mail.text).toContain('tu contraseña sigue igual');
  });

  it('warns about an existing account without any link', () => {
    const payload: AccountLinkSentPayload = {
      userId: base.userId,
      email: base.email,
      fullName: base.fullName,
      reason: 'ALREADY_REGISTERED',
    };
    const mail = accountLinkEmail(payload);

    expect(mail.subject).toBe('Ya tienes una cuenta en debus');
    expect(mail.html).not.toContain('href="http');
  });

  it('does not double the period after an afternoon time', () => {
    const mail = accountLinkEmail({
      ...base,
      reason: 'SIGNUP',
      expiresAt: '2026-10-11T20:30:00.000Z',
    });

    expect(mail.text).toContain('p. m. Si no esperabas');
    expect(mail.text).not.toContain('..');
  });

  it('shows the expiry in Guatemala time', () => {
    const mail = accountLinkEmail({
      ...base,
      reason: 'SIGNUP',
      expiresAt: '2026-10-11T03:30:00.000Z',
    });

    expect(mail.text).toContain('10 de octubre de 2026');
  });
});
