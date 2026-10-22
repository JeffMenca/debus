import type { WalletCreditedPayload } from '@debus/contracts';
import { composeEmail } from '../mail/compose';
import { formatDate, formatMoney } from '../mail/format';
import type { MailMessage } from '../mail/mailer';

export function walletCreditedEmail(credit: WalletCreditedPayload): MailMessage {
  const amount = formatMoney(credit.amount);
  const balance = `Tu saldo ahora es de ${formatMoney(credit.balanceAfter)}.`;
  const heading = `Hola, ${credit.fullName}`;
  if (credit.kind === 'REFUND') {
    return composeEmail(credit.email, `Te devolvimos ${amount} a tu saldo`, {
      heading,
      paragraphs: [`${credit.description}. Ya puedes usar ese dinero.`, balance],
      footnote: `Acreditado el ${formatDate(credit.occurredOn)}.`,
    });
  }
  return composeEmail(credit.email, `Recargaste ${amount} a tu saldo`, {
    heading,
    paragraphs: [
      `Recibimos tu recarga de ${amount} del ${formatDate(credit.occurredOn)}.`,
      balance,
    ],
    footnote: 'Si no reconoces esta recarga, comunícate con tu sucursal.',
  });
}
