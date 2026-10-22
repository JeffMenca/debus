import { exampleRentalPaid } from '@debus/contracts';
import { rentalPaidEmail } from './rental-email';

describe('rental email', () => {
  it('confirms the paid rental with the trip, the passengers and the price', () => {
    const message = rentalPaidEmail({ ...exampleRentalPaid, email: 'reservas@colegio.edu.gt' });

    expect(message.to).toBe('reservas@colegio.edu.gt');
    expect(message.subject).toBe('Tu alquiler está confirmado');
    expect(message.text).toContain('Hola, Colegio San José');
    expect(message.text).toContain('Quetzaltenango - Panajachel');
    expect(message.text).toContain('24 de octubre de 2026 a las 7:00 a. m.');
    expect(message.text).toContain('Regreso: 24 de octubre de 2026 a las 5:00 p. m.');
    expect(message.text).not.toMatch(/\.\./);
    expect(message.text).toContain('35 pasajeros');
    expect(message.text).toMatch(/Q\s?2,760\.00/);
  });

  it('leaves the return out of a one-way rental', () => {
    const message = rentalPaidEmail({
      ...exampleRentalPaid,
      email: 'reservas@colegio.edu.gt',
      returnAt: null,
    });

    expect(message.text).not.toContain('Regreso');
  });
});
