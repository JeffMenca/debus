import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, columnHelperFor } from './data-table';

interface Row {
  id: string;
  name: string;
  km: number;
}
const helper = columnHelperFor<Row>();
const columns = helper.columns([
  helper.accessor('name', { header: 'Nombre' }),
  helper.accessor('km', {
    header: 'Kilometraje',
    cell: (info) => info.getValue().toLocaleString('en-US'),
  }),
]);
const rows: Row[] = [
  { id: '1', name: 'Volvo B8R', km: 148410 },
  { id: '2', name: 'Scania K360', km: 96220 },
];

describe('DataTable', () => {
  it('renders an accessible table with headers, cells and the summary', () => {
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        emptyMessage="Sin buses"
        summary="Mostrando 2 de 2 buses"
        footerNote={<span>Nota al pie</span>}
      />,
    );

    const table = screen.getByRole('table', { name: 'Buses' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Nombre', 'Kilometraje']);
    expect(within(table).getByText('148,410')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Mostrando 2 de 2 buses')).toBeInTheDocument();
    expect(screen.getByText('Nota al pie')).toBeInTheDocument();
  });

  it('uses the given row ids', () => {
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        getRowId={(row) => `bus-${row.id}`}
        emptyMessage=""
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows skeleton rows while loading and a friendly empty state', () => {
    const { rerender } = render(
      <DataTable caption="Buses" columns={columns} data={[]} isLoading emptyMessage="Sin buses" />,
    );
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();

    rerender(
      <DataTable caption="Buses" columns={columns} data={[]} emptyMessage="Aún no hay buses" />,
    );

    expect(screen.queryByLabelText('Cargando')).not.toBeInTheDocument();
    expect(screen.getByText('Aún no hay buses')).toBeInTheDocument();
  });

  it('offers a retry when loading failed', async () => {
    const onRetry = jest.fn();
    render(
      <DataTable
        caption="Buses"
        columns={columns}
        data={[]}
        error="No pudimos cargar los buses."
        onRetry={onRetry}
        emptyMessage=""
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los buses.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the error without a retry button when there is nothing to retry', () => {
    render(
      <DataTable caption="Buses" columns={columns} data={[]} error="Falló." emptyMessage="" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falló.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('shows the PDF export only when a report asks for it', async () => {
    const onExport = jest.fn();
    const { rerender } = render(
      <DataTable caption="Buses" columns={columns} data={rows} emptyMessage="" />,
    );
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).not.toBeInTheDocument();

    rerender(
      <DataTable
        caption="Buses"
        columns={columns}
        data={rows}
        emptyMessage=""
        onExport={onExport}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(onExport).toHaveBeenCalled();
  });

  it('keeps screen-reader-only text inside its cell, so it never widens the page', () => {
    const withHidden = helper.columns([
      helper.accessor('name', { header: () => <span className="sr-only">Nombre oculto</span> }),
    ]);
    render(<DataTable caption="Buses" columns={withHidden} data={rows} emptyMessage="" />);

    // An absolutely positioned child needs a positioned cell, or it sticks out of the scroll area.
    expect(screen.getByRole('columnheader')).toHaveClass('relative');
  });
});
