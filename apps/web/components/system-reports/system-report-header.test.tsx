import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemReportHeader } from './system-report-header';

const user = userEvent.setup({ applyAccept: false });

it('names the report and what it covers, and offers the PDF as the one primary button', async () => {
  const onExport = jest.fn();
  render(<SystemReportHeader title="Ganancias" onExport={onExport} />);

  expect(screen.getByRole('heading', { level: 1, name: 'Ganancias' })).toBeInTheDocument();
  expect(screen.getByText('Reportes · todas las sucursales')).toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Exportar PDF' });
  expect(button).toHaveClass('bg-primary');
  await user.click(button);
  expect(onExport).toHaveBeenCalledTimes(1);
});

it('says what else the report covers when it is not every branch', () => {
  render(
    <SystemReportHeader
      title="Mapa de rutas"
      scope="rutas por sucursal de origen"
      onExport={jest.fn()}
    />,
  );

  expect(screen.getByText('Reportes · rutas por sucursal de origen')).toBeInTheDocument();
});

it('waits for the report before it exports and shows that it is preparing the file', () => {
  const { rerender } = render(
    <SystemReportHeader title="Ganancias" onExport={jest.fn()} disabled />,
  );
  expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();

  rerender(<SystemReportHeader title="Ganancias" onExport={jest.fn()} exporting />);
  expect(screen.getByRole('button', { name: 'Preparando PDF…' })).toBeDisabled();
});
