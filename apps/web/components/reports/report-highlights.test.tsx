import { render, screen } from '@testing-library/react';
import { ReportHighlights } from './report-highlights';

beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

describe('ReportHighlights', () => {
  it('shows one card per highlight with its value, format and hint', () => {
    render(
      <ReportHighlights
        items={[
          { label: 'Buses', value: 5, tone: 'indigo' },
          {
            label: 'Ingresos',
            value: 1250,
            tone: 'mint',
            format: (n) => `Q ${n}`,
            hint: 'Boletos',
          },
        ]}
      />,
    );

    expect(screen.getByText('Buses')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Q 1250')).toBeInTheDocument();
    expect(screen.getByText('Boletos')).toBeInTheDocument();
  });

  it('shows skeleton cards while the report loads', () => {
    render(<ReportHighlights items={undefined} placeholders={3} />);

    expect(screen.getAllByLabelText('Cargando')).toHaveLength(3);
  });
});
