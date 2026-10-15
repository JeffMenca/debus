import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportHeader } from './report-header';

describe('ReportHeader', () => {
  it('shows the report and its branch above, with a link back to the reports', () => {
    render(<ReportHeader scope="Quetzaltenango" title="Listado de buses" onExport={jest.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Listado de buses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reportes' })).toHaveAttribute(
      'href',
      '/sucursal/reportes',
    );
    expect(screen.getByText(/Quetzaltenango/)).toBeInTheDocument();
  });

  it('has a single primary button to export the PDF', async () => {
    const onExport = jest.fn();
    render(<ReportHeader scope="Quetzaltenango" title="Listado de buses" onExport={onExport} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Exportar PDF');
    expect(buttons[0]).toHaveClass('bg-primary');
    await userEvent.click(buttons[0]!);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('says the file is being prepared and cannot be asked for twice', () => {
    render(
      <ReportHeader
        scope="Quetzaltenango"
        title="Listado de buses"
        onExport={jest.fn()}
        exporting
      />,
    );

    expect(screen.getByRole('button', { name: 'Preparando PDF…' })).toBeDisabled();
  });

  it('disables the export while the report has not loaded', () => {
    render(<ReportHeader title="Listado de buses" onExport={jest.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
  });
});
