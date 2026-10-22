import { composeEmail } from '../mail/compose';
import { formatDate } from '../mail/format';
import type { MailMessage } from '../mail/mailer';

interface Driver {
  email: string;
  fullName: string;
  licenseExpiresOn: string;
}

function expiresIn(days: number): string {
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  return `vence en ${days} días`;
}

export function licenseDriverEmail(driver: Driver, daysLeft: number): MailMessage {
  return composeEmail(driver.email, `Tu licencia ${expiresIn(daysLeft)}`, {
    heading: `Hola, ${driver.fullName}`,
    paragraphs: [
      `Tu licencia de conducir es válida hasta el ${formatDate(driver.licenseExpiresOn)}.`,
      'Renuévala a tiempo para seguir manejando sin contratiempos.',
    ],
    footnote: 'Si ya la renovaste, pide a tu sucursal que actualice la fecha.',
  });
}

export function licenseAdminEmail(
  driver: Driver,
  admin: { email: string; fullName: string },
  daysLeft: number,
): MailMessage {
  return composeEmail(admin.email, `La licencia de ${driver.fullName} ${expiresIn(daysLeft)}`, {
    heading: `Hola, ${admin.fullName}`,
    paragraphs: [
      `${driver.fullName}, de tu sucursal, tiene la licencia de conducir vigente hasta el ${formatDate(driver.licenseExpiresOn)}.`,
      'Recuérdale renovarla y, cuando lo haga, actualiza la fecha en su ficha.',
    ],
  });
}
