import { type EmailLayoutInput, renderEmailLayout } from './email-layout';
import type { MailMessage } from './mailer';

// "p. m." already ends in a period, so a sentence that ends with a time would get two.
const oneFinalPeriod = (text: string): string => text.replace(/\.\.(?=\s|$)/g, '.');

export function composeEmail(
  to: string,
  subject: string,
  layout: Omit<EmailLayoutInput, 'preheader'>,
): MailMessage {
  const { html, text } = renderEmailLayout({
    preheader: subject,
    ...layout,
    paragraphs: layout.paragraphs.map(oneFinalPeriod),
    ...(layout.footnote && { footnote: oneFinalPeriod(layout.footnote) }),
  });
  return { to, subject, html, text };
}
