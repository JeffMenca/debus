import { exampleTicketSold } from '@debus/contracts';
import { ticketSoldEmail, tripCancelledEmail } from './ticket-emails';

const ticket = {
  ...exampleTicketSold,
  channel: 'ONLINE' as const,
  buyerName: 'Ana Méndez',
  email: 'ana@correo.com',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: '2026-10-25T05:30:00.000Z',
  seats: [6, 5],
  unitPrice: 85,
  total: 170,
};

describe('ticket emails', () => {
  it('confirms the purchase with the trip in Guatemala time, the seats and the total', () => {
    const message = ticketSoldEmail(ticket);

    expect(message.to).toBe('ana@correo.com');
    expect(message.subject).toBe('Tu boleto para Quetzaltenango - Guatemala');
    expect(message.text).toContain('Hola, Ana Méndez');
    expect(message.text).toContain('24 de octubre de 2026 a las 11:30 p. m.\n\nTu lugar');
    expect(message.text).not.toMatch(/\.\./);
    expect(message.text).toContain('asientos 5 y 6');
    expect(message.text).toMatch(/Q\s?170\.00/);
  });

  it('tells an online buyer the money goes back to the balance', () => {
    const message = tripCancelledEmail(ticket);

    expect(message.subject).toBe('Se canceló tu viaje a Guatemala');
    expect(message.text).toContain('Lo sentimos, Ana Méndez');
    expect(message.text).not.toMatch(/\.\./);
    expect(message.text).toContain('Te devolvemos lo que pagaste a tu saldo');
    expect(message.text).not.toContain('ventanilla');
  });

  it('sends a counter buyer to the counter for the cash', () => {
    const message = tripCancelledEmail({ ...ticket, channel: 'COUNTER' });

    expect(message.text).toContain('Acércate a la ventanilla');
    expect(message.text).not.toContain('saldo');
  });
});
