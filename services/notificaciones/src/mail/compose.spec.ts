import { composeEmail } from './compose';

describe('composeEmail', () => {
  it('builds the message with the subject as preheader and escapes what the client typed', () => {
    const message = composeEmail('ana@correo.com', 'Tu boleto', {
      heading: 'Hola, <Ana>',
      paragraphs: ['Listo'],
    });

    expect(message).toMatchObject({ to: 'ana@correo.com', subject: 'Tu boleto' });
    expect(message.html).toContain('Hola, &lt;Ana&gt;');
    expect(message.html).toContain('<span style="display:none">Tu boleto</span>');
    expect(message.text).toBe('Hola, <Ana>\n\nListo');
  });

  it('never ends a sentence with two periods after an afternoon time', () => {
    const message = composeEmail('ana@correo.com', 'Tu boleto', {
      heading: 'Hola',
      paragraphs: ['Sales el 24 de octubre a las 11:30 p. m..', 'Listo.'],
      footnote: 'Hasta las 2:00 p. m..',
    });

    expect(message.text).toBe(
      'Hola\n\nSales el 24 de octubre a las 11:30 p. m.\n\nListo.\n\nHasta las 2:00 p. m.',
    );
    expect(message.html).not.toMatch(/\.\./);
  });
});
