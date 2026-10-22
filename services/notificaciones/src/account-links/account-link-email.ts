import type { AccountLinkSentPayload, AccountLinkReason } from '@debus/contracts';
import { composeEmail } from '../mail/compose';
import { formatDateTime } from '../mail/format';
import type { MailMessage } from '../mail/mailer';

interface Copy {
  subject: string;
  paragraph: string;
  action?: string;
  footnote: (expires: string) => string;
}

function unexpectedNote(expires: string): string {
  return `Este enlace vence el ${expires}. Si no esperabas este correo, ignóralo.`;
}

const COPY: Record<AccountLinkReason, Copy> = {
  INVITATION: {
    subject: 'Te damos la bienvenida a debus',
    paragraph: 'Te crearon una cuenta en debus. Para empezar, crea tu contraseña.',
    action: 'Crear mi contraseña',
    footnote: unexpectedNote,
  },
  SIGNUP: {
    subject: 'Confirma tu correo en debus',
    paragraph: 'Gracias por registrarte. Confirma tu correo creando tu contraseña.',
    action: 'Crear mi contraseña',
    footnote: unexpectedNote,
  },
  PASSWORD_RESET: {
    subject: 'Restablece tu contraseña de debus',
    paragraph: 'Pediste cambiar tu contraseña. Hazlo desde este enlace.',
    action: 'Elegir nueva contraseña',
    footnote: (expires) =>
      `Este enlace vence el ${expires}. Si no lo pediste, ignora este correo: tu contraseña sigue igual.`,
  },
  ALREADY_REGISTERED: {
    subject: 'Ya tienes una cuenta en debus',
    paragraph:
      'Alguien intentó crear una cuenta con este correo, pero ya tienes una. Si olvidaste tu contraseña, puedes restablecerla al iniciar sesión.',
    footnote: () => 'Si no fuiste tú, ignora este correo.',
  },
};

export function accountLinkEmail(payload: AccountLinkSentPayload): MailMessage {
  const copy = COPY[payload.reason];
  const action =
    copy.action && payload.link ? { label: copy.action, href: payload.link } : undefined;
  return composeEmail(payload.email, copy.subject, {
    heading: `Hola, ${payload.fullName}`,
    paragraphs: [copy.paragraph],
    action,
    footnote: copy.footnote(payload.expiresAt ? formatDateTime(payload.expiresAt) : ''),
  });
}
