import { extractLink, htmlOf } from './mime';

const CRLF = '\r\n';
const message = (...lines: string[]) => lines.join(CRLF);

describe('htmlOf', () => {
  it('returns the HTML of a single-part message', () => {
    const source = message('Content-Type: text/html; charset=utf-8', '', '<p>Hola</p>');
    expect(htmlOf(source)).toBe('<p>Hola</p>');
  });

  it('decodes quoted-printable, soft line breaks included', () => {
    const source = message(
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<a href=3D"http://x/crear-contrasena?token=3Dabc=',
      'def">Crea tu contrase=C3=B1a</a>',
    );
    expect(htmlOf(source)).toBe(
      '<a href="http://x/crear-contrasena?token=abcdef">Crea tu contraseña</a>',
    );
  });

  it('decodes base64', () => {
    const body = Buffer.from('<p>Contraseña</p>', 'utf8').toString('base64');
    const source = message(
      'Content-Type: text/html',
      'Content-Transfer-Encoding: base64',
      '',
      body,
    );
    expect(htmlOf(source)).toBe('<p>Contraseña</p>');
  });

  it('finds the HTML part inside nested multipart messages', () => {
    const source = message(
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: multipart/alternative; boundary="inner"',
      '',
      '--inner',
      'Content-Type: text/plain',
      '',
      'solo texto',
      '--inner',
      'Content-Type: text/html',
      '',
      '<b>enlace</b>',
      '--inner--',
      '--outer--',
    );
    expect(htmlOf(source)).toBe('<b>enlace</b>');
  });

  it('unfolds a header that continues on the next line', () => {
    const source = message(
      'Content-Type: multipart/alternative;',
      ' boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/html',
      '',
      '<i>x</i>',
      '--b1--',
    );
    expect(htmlOf(source)).toBe('<i>x</i>');
  });

  it('returns an empty string when there is no HTML part', () => {
    expect(htmlOf(message('Content-Type: text/plain', '', 'hola'))).toBe('');
    expect(htmlOf('sin cabeceras')).toBe('');
  });
});

describe('extractLink', () => {
  const html = (href: string) => `<p><a href="${href}">Crear</a></p>`;

  it('returns the path and query of the first link that matches, with &amp; resolved', () => {
    const body = html('https://debus.example/crear-contrasena?token=abc&amp;x=1');
    expect(extractLink(body, '/(?:crear-contrasena|restablecer)')).toBe(
      '/crear-contrasena?token=abc&x=1',
    );
  });

  it('skips links of other paths', () => {
    const body =
      html('https://debus.example/login') + html('https://debus.example/restablecer?token=z');
    expect(extractLink(body, '/(?:crear-contrasena|restablecer)')).toBe('/restablecer?token=z');
  });

  it('returns null when nothing matches', () => {
    expect(extractLink(html('https://debus.example/login'), '/restablecer')).toBeNull();
  });
});
