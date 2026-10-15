// Just enough MIME to find the HTML body of an email and read the link in it.

interface Part {
  headers: Map<string, string>;
  body: string;
}

function parsePart(raw: string): Part {
  const split = raw.search(/\r?\n\r?\n/);
  const head = split === -1 ? raw : raw.slice(0, split);
  const body = split === -1 ? '' : raw.slice(split).replace(/^\r?\n\r?\n/, '');
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
  }
  return { headers, body };
}

function decodeBody({ headers, body }: Part): string {
  const encoding = headers.get('content-transfer-encoding')?.toLowerCase();
  if (encoding === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (encoding === 'quoted-printable') {
    const bytes = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(bytes, 'latin1').toString('utf8');
  }
  return body.replace(/\r?\n$/, '');
}

export function htmlOf(source: string): string {
  const part = parsePart(source);
  const type = part.headers.get('content-type') ?? '';
  if (/^text\/html/i.test(type)) return decodeBody(part);
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (!/^multipart\//i.test(type) || !boundary) return '';
  const pieces = part.body.split(`--${boundary}`).slice(1);
  for (const piece of pieces) {
    if (piece.startsWith('--')) break;
    const html = htmlOf(piece.replace(/^\r?\n/, ''));
    if (html) return html;
  }
  return '';
}

// Returns the path and query only: the email points at the public address, not at the one the
// seed talks to.
export function extractLink(html: string, pathPattern: string): string | null {
  const match = new RegExp(`href="([^"]*${pathPattern}\\?token=[^"]+)"`).exec(html);
  if (!match?.[1]) return null;
  const link = new URL(match[1].replace(/&amp;/g, '&'));
  return `${link.pathname}${link.search}`;
}
