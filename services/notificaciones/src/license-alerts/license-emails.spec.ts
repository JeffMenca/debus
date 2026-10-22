import { licenseAdminEmail, licenseDriverEmail } from './license-emails';

const driver = {
  email: 'luis@correo.com',
  fullName: 'Luis Pérez',
  licenseExpiresOn: '2026-11-01',
};

describe('license emails', () => {
  it('reminds the driver with the days left and the date', () => {
    const message = licenseDriverEmail(driver, 15);

    expect(message.to).toBe('luis@correo.com');
    expect(message.subject).toBe('Tu licencia vence en 15 días');
    expect(message.text).toContain('Hola, Luis Pérez');
    expect(message.text).toContain('1 de noviembre de 2026');
  });

  it('tells the branch admin which driver to remind', () => {
    const message = licenseAdminEmail(driver, { email: 'marta@correo.com', fullName: 'Marta' }, 3);

    expect(message.to).toBe('marta@correo.com');
    expect(message.subject).toBe('La licencia de Luis Pérez vence en 3 días');
    expect(message.text).toContain('Hola, Marta');
    expect(message.text).toContain('Recuérdale renovarla');
  });

  it('says today or tomorrow instead of a count', () => {
    expect(licenseDriverEmail(driver, 0).subject).toBe('Tu licencia vence hoy');
    expect(licenseDriverEmail(driver, 1).subject).toBe('Tu licencia vence mañana');
  });
});
