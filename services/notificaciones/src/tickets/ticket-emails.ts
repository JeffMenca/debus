import type { SaleChannel, TicketSoldPayload } from '@debus/contracts';
import { composeEmail } from '../mail/compose';
import { formatDateTime, formatMoney, formatSeats } from '../mail/format';
import type { MailMessage } from '../mail/mailer';

// What the cancellation needs, from the event or from the copy kept for it.
export interface TicketNotice {
  email: string;
  buyerName: string;
  channel: SaleChannel;
  originLabel: string;
  destinationLabel: string;
  departureAt: string;
}

export function ticketSoldEmail(ticket: TicketSoldPayload & { email: string }): MailMessage {
  const route = `${ticket.originLabel} - ${ticket.destinationLabel}`;
  return composeEmail(ticket.email, `Tu boleto para ${route}`, {
    heading: `Hola, ${ticket.buyerName}`,
    paragraphs: [
      `Tu compra está lista. Viajas de ${route} el ${formatDateTime(ticket.departureAt)}.`,
      `Tu lugar: ${formatSeats(ticket.seats)}. Total pagado: ${formatMoney(ticket.total)}.`,
    ],
    footnote: 'Llega a la terminal con tiempo. Si tu viaje cambia, te avisaremos por aquí.',
  });
}

export function tripCancelledEmail(ticket: TicketNotice): MailMessage {
  const refund =
    ticket.channel === 'COUNTER'
      ? 'Acércate a la ventanilla de la terminal con tu boleto para recibir tu dinero.'
      : 'Te devolvemos lo que pagaste a tu saldo; te avisaremos en cuanto esté acreditado.';
  return composeEmail(ticket.email, `Se canceló tu viaje a ${ticket.destinationLabel}`, {
    heading: `Lo sentimos, ${ticket.buyerName}`,
    paragraphs: [
      `El viaje de ${ticket.originLabel} - ${ticket.destinationLabel} del ${formatDateTime(ticket.departureAt)} se canceló.`,
      refund,
    ],
    footnote: 'Puedes buscar otro horario cuando quieras en debus.',
  });
}
