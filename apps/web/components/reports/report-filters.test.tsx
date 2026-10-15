import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportFilters } from './report-filters';

describe('ReportFilters', () => {
  it('offers to clear the filters only when something narrows the report', async () => {
    const onClear = jest.fn();
    const { rerender } = render(
      <ReportFilters narrowed={false} onClear={onClear}>
        <span>Periodo</span>
      </ReportFilters>,
    );
    expect(screen.getByText('Periodo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();

    rerender(
      <ReportFilters narrowed onClear={onClear}>
        <span>Periodo</span>
      </ReportFilters>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
