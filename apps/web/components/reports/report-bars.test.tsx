import { render, screen } from '@testing-library/react';
import { ReportBars } from './report-bars';

const items = [
  { key: 'a', label: 'Quetzaltenango', value: 200 },
  { key: 'b', label: 'Cobán', value: 50 },
  { key: 'c', label: 'Antigua', value: 0 },
];

const reduced = (matches: boolean) => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: matches && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};
const widthOf = (label: string) => (screen.getByTestId(`bar-${label}`) as HTMLElement).style.width;

describe('ReportBars', () => {
  it('measures the biggest bar at 100% and the rest in proportion', () => {
    reduced(false);
    render(<ReportBars title="Ingresos por ruta" items={items} format={(n) => `Q ${n}`} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Ingresos por ruta' }),
    ).toBeInTheDocument();
    expect(widthOf('a')).toBe('100%');
    expect(widthOf('b')).toBe('25%');
    expect(widthOf('c')).toBe('0%');
    expect(screen.getByText('Q 200')).toBeInTheDocument();
    expect(screen.getByText('Quetzaltenango')).toBeInTheDocument();
  });

  it('grows the bars unless the person asked for less motion', () => {
    reduced(false);
    const { unmount } = render(<ReportBars title="Barras" items={items} format={String} />);
    expect(screen.getByTestId('bar-a')).toHaveClass('animate-grow-x');
    unmount();

    reduced(true);
    render(<ReportBars title="Barras" items={items} format={String} />);
    expect(screen.getByTestId('bar-a')).not.toHaveClass('animate-grow-x');
  });

  it('draws nothing wide when every value is zero', () => {
    reduced(false);
    render(
      <ReportBars
        title="Barras"
        items={[{ key: 'z', label: 'Cobán', value: 0 }]}
        format={String}
      />,
    );

    expect(widthOf('z')).toBe('0%');
  });

  it('draws a loss in the warning tone, measured by its size, and still writes the value', () => {
    reduced(false);
    render(
      <ReportBars
        title="Barras"
        items={[
          { key: 'p', label: 'Cobán', value: 100 },
          { key: 'n', label: 'Antigua', value: -40 },
        ]}
        format={(n) => `Q ${n}`}
      />,
    );

    expect(widthOf('p')).toBe('100%');
    expect(widthOf('n')).toBe('40%');
    expect(screen.getByTestId('bar-n')).toHaveClass('bg-destructive');
    expect(screen.getByText('Q -40')).toBeInTheDocument();
  });

  it('still draws the bars when every branch lost money', () => {
    reduced(false);
    render(
      <ReportBars
        title="Barras"
        items={[
          { key: 'a', label: 'Cobán', value: -200 },
          { key: 'b', label: 'Antigua', value: -50 },
        ]}
        format={String}
      />,
    );

    expect(widthOf('a')).toBe('100%');
    expect(widthOf('b')).toBe('25%');
  });
});
