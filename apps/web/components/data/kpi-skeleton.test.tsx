import { render, screen } from '@testing-library/react';
import { KpiSkeleton } from './kpi-skeleton';

it('announces a loading card with the size of a KPI card', () => {
  render(<KpiSkeleton />);

  const card = screen.getByLabelText('Cargando');
  expect(card).toHaveClass('rounded-[22px]', 'bg-card');
});
