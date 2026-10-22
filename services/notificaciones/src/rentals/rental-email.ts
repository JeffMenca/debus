import type { RentalPaidPayload } from '@debus/contracts';
import { composeEmail } from '../mail/compose';
import { formatDateTime, formatMoney } from '../mail/format';
import type { MailMessage } from '../mail/mailer';

export function rentalPaidEmail(rental: RentalPaidPayload & { email: string }): MailMessage {
  return composeEmail(rental.email, 'Tu alquiler está confirmado', {
    heading: `Hola, ${rental.clientName}`,
    paragraphs: [
      `Recibimos tu pago de ${formatMoney(rental.price)}. Tu viaje ${rental.originLabel} - ${rental.destinationLabel} para ${rental.passengers} pasajeros está confirmado.`,
      `Salida: ${formatDateTime(rental.departureAt)}.`,
      ...(rental.returnAt ? [`Regreso: ${formatDateTime(rental.returnAt)}.`] : []),
    ],
    footnote: 'Tu sucursal asignará el bus y el chofer antes de la salida.',
  });
}
