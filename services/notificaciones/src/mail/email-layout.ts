// Email clients ignore CSS variables, so the design tokens are copied here once.
export const EMAIL_PALETTE = {
  background: '#F3F5FF',
  card: '#FFFFFF',
  ink: '#1B1F3B',
  muted: '#575C7D',
  primary: '#3E4FC7',
  primaryInk: '#FFFFFF',
  accent: '#FFCE5C',
} as const;

const FONT = "Figtree, 'Segoe UI', Arial, sans-serif";
// A long unbroken word (a name, a link) must wrap instead of widening the card.
const WRAP = 'overflow-wrap:anywhere;word-break:break-word';

export interface EmailLayoutInput {
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; href: string };
  footnote?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const p = EMAIL_PALETTE;
  const paragraphs = input.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${p.muted};${WRAP}">${escapeHtml(text)}</p>`,
    )
    .join('');
  const action = input.action
    ? `<p style="margin:8px 0 24px"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;background:${p.primary};color:${p.primaryInk};text-decoration:none;font-weight:600;padding:14px 24px;border-radius:10px">${escapeHtml(input.action.label)}</a></p>`
    : '';
  const footnote = input.footnote
    ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${p.muted};${WRAP}">${escapeHtml(input.footnote)}</p>`
    : '';
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:${p.background};font-family:${FONT}">
<span style="display:none">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;table-layout:fixed;background:${p.card};border-radius:24px;padding:32px">
<tr><td><p style="margin:0 0 24px;font-size:22px;font-weight:700;color:${p.ink}"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.accent};margin-right:8px"></span>debus</p>
<h1 style="margin:0 0 16px;font-size:26px;color:${p.ink};${WRAP}">${escapeHtml(input.heading)}</h1>
${paragraphs}${action}${footnote}</td></tr></table></td></tr></table></body></html>`;

  const text = [
    input.heading,
    ...input.paragraphs,
    ...(input.action ? [`${input.action.label}: ${input.action.href}`] : []),
    ...(input.footnote ? [input.footnote] : []),
  ].join('\n\n');
  return { html, text };
}
