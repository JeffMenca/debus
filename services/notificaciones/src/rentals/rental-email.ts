import type { RentalConfirmedPayload, RentalPaidPayload } from '@debus/contracts';
import { composeEmail } from '../mail/compose';
import { formatDateTime, formatMoney } from '../mail/format';
import type { MailMessage } from '../mail/mailer';

const scheduleLines = (rental: { departureAt: string; returnAt: string | null }): string[] => [
  `Salida: ${formatDateTime(rental.departureAt)}.`,
  ...(rental.returnAt ? [`Regreso: ${formatDateTime(rental.returnAt)}.`] : []),
];

export function rentalPaidEmail(rental: RentalPaidPayload & { email: string }): MailMessage {
  return composeEmail(rental.email, 'Tu alquiler está confirmado', {
    heading: `Hola, ${rental.clientName}`,
    paragraphs: [
      `Recibimos tu pago de ${formatMoney(rental.price)}. Tu viaje ${rental.originLabel} - ${rental.destinationLabel} para ${rental.passengers} pasajeros está confirmado.`,
      ...scheduleLines(rental),
    ],
    footnote: 'Tu sucursal asignará el bus y el chofer antes de la salida.',
  });
}

// The branch admin set the price of a rental: the client pays it from the account.
export function rentalConfirmedEmail(rental: RentalConfirmedPayload): MailMessage {
  return composeEmail(rental.email, 'Tu cotización está lista', {
    heading: `Hola, ${rental.clientName}`,
    paragraphs: [
      `La sucursal confirmó el precio de tu viaje ${rental.originLabel} - ${rental.destinationLabel} para ${rental.passengers} pasajeros: ${formatMoney(rental.price)}.`,
      ...scheduleLines(rental),
    ],
    footnote: 'Págalo desde tu cuenta, en Alquileres, con tu cartera digital.',
  });
}
