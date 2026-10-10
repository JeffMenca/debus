import { escapeHtml, renderEmailLayout } from './email-layout';

describe('email layout', () => {
  const email = renderEmailLayout({
    preheader: 'Crea tu contraseña',
    heading: 'Hola, Ana',
    paragraphs: ['Primer párrafo.'],
    action: { label: 'Crear mi contraseña', href: 'https://web.example/x?token=a&b=1' },
    footnote: 'Nota.',
  });

  it('renders the heading, the paragraphs and a button link', () => {
    expect(email.html).toContain('Hola, Ana');
    expect(email.html).toContain('Primer párrafo.');
    expect(email.html).toContain('href="https://web.example/x?token=a&amp;b=1"');
    expect(email.html).toContain('Crear mi contraseña');
  });

  it('offers a plain text version with the raw link', () => {
    expect(email.text).toContain('Crear mi contraseña: https://web.example/x?token=a&b=1');
    expect(email.text).toContain('Nota.');
  });

  it('escapes user provided values', () => {
    expect(escapeHtml('<b>"Ana" & co</b>')).toBe('&lt;b&gt;&quot;Ana&quot; &amp; co&lt;/b&gt;');
    expect(
      renderEmailLayout({ preheader: 'p', heading: '<script>', paragraphs: [] }).html,
    ).not.toContain('<script>');
  });

  it('escapes the paragraphs, the footnote, the button label and the preheader', () => {
    const evil = '<i>x</i> & "y"';
    const escaped = '&lt;i&gt;x&lt;/i&gt; &amp; &quot;y&quot;';
    const { html } = renderEmailLayout({
      preheader: evil,
      heading: 'Hola',
      paragraphs: [evil],
      action: { label: evil, href: 'https://web.example' },
      footnote: evil,
    });

    expect(html).not.toContain('<i>');
    expect(html.split(escaped)).toHaveLength(5);
  });

  it('wraps long unbroken words so a small screen never scrolls sideways', () => {
    const { html } = renderEmailLayout({
      preheader: 'p',
      heading: 'Hola, Anastasiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      paragraphs: ['Texto.'],
      footnote: 'Nota.',
    });

    expect(html).toContain('table-layout:fixed');
    const wrapping = html.match(/overflow-wrap:anywhere/g) ?? [];
    // heading, one paragraph and the footnote
    expect(wrapping).toHaveLength(3);
  });

  it('omits the button and the footnote when they are not given', () => {
    const plain = renderEmailLayout({ preheader: 'p', heading: 'Hola', paragraphs: ['Texto.'] });

    expect(plain.html).not.toContain('<a ');
    expect(plain.text).toBe('Hola\n\nTexto.');
  });
});
