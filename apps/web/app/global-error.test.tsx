import { renderToStaticMarkup } from 'react-dom/server';
import GlobalError from './global-error';

describe('the page for an error in the root layout', () => {
  it('brings its own document, in Spanish, with the same text as the error page', () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error('secreto')} retry={() => {}} />,
    );

    expect(markup).toMatch(/^<html lang="es"/);
    expect(markup).toContain('<body');
    expect(markup).toContain('Algo salió mal al mostrar esta pantalla');
    expect(markup).toContain('Intentar de nuevo');
    expect(markup).toContain('Ir al inicio');
    expect(markup).not.toContain('secreto');
  });
});
