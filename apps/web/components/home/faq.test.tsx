import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Faq } from './faq';

const QUESTIONS = [
  [
    '¿Necesito una cuenta para comprar?',
    'Para comprar en línea sí: crear tu cuenta toma un minuto. Si prefieres, también puedes comprar en la ventanilla de cualquier sucursal, sin cuenta.',
  ],
  [
    '¿Cómo pago mis boletos?',
    'Con el saldo de tu cartera digital. La recargas cuando quieras, indicando la cantidad y la fecha del pago.',
  ],
  [
    '¿Puedo alquilar un bus para mi grupo?',
    'Sí. Pides tu viaje indicando origen, destino, fecha y número de pasajeros; la sucursal confirma el precio y tú lo pagas con tu cartera.',
  ],
  [
    '¿Qué pasa si se cancela mi viaje?',
    'Te devolvemos el valor de tu boleto a tu cartera digital.',
  ],
] as const;

describe('Faq', () => {
  it('titles the section', () => {
    render(<Faq />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' }),
    ).toBeInTheDocument();
  });

  it('lists the four questions in order, each with its exact answer, closed at first', () => {
    const { container } = render(<Faq />);

    const items = Array.from(container.querySelectorAll('details'));
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      const [question, answer] = QUESTIONS[index];
      expect(item.querySelector('summary')).toHaveTextContent(question);
      expect(within(item).getByText(answer)).toBeInTheDocument();
      expect(item).not.toHaveAttribute('open');
    });
  });

  // The keyboard (Enter and Space on the summary) is native and is covered in the browser tests.
  it('opens a question and closes it again when its summary is activated', async () => {
    const user = userEvent.setup();
    render(<Faq />);
    const summary = screen.getByText('¿Cómo pago mis boletos?').closest('summary')!;

    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');

    await user.click(summary);
    expect(summary.closest('details')).not.toHaveAttribute('open');
  });

  it('draws the questions as cards with no borders and no loose hex', () => {
    const { container } = render(<Faq />);

    for (const item of container.querySelectorAll('details')) {
      expect(item).toHaveClass('bg-card', 'rounded-[24px]');
    }
    // The brand illustration carries its own palette.
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-bus]')?.remove();
    expect(clone.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(clone.innerHTML).not.toMatch(/\bborder\b/);
  });

  it('hides the arrows and the small bus from screen readers', () => {
    const { container } = render(<Faq />);

    expect(container.querySelectorAll('summary svg[aria-hidden="true"]')).toHaveLength(4);
    expect(container.querySelector('[data-bus]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('gives the summary a visible focus and stops the arrow turning with reduced motion', () => {
    const { container } = render(<Faq />);

    const summary = container.querySelector('summary')!;
    expect(summary).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-ring');
    expect(container.querySelector('summary svg')?.getAttribute('class')).toContain(
      'motion-reduce:transition-none',
    );
  });
});
